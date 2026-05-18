import { NextResponse } from "next/server";

import { streamsRepo } from "@/lib/db";
import {
  HikConnectError,
  listHikConnectCameras,
  listHikConnectDevices,
} from "@/lib/hikconnect";
import {
  getActiveHikConnectSession,
  hasStoredHikConnectAccount,
} from "@/lib/hikconnect-session";

export const runtime = "nodejs";

/**
 * Flattened device tree for the UI. For each device we enumerate its camera
 * channels (an NVR can expose 8, a standalone camera exposes 1) and mark any
 * channel that is already imported as a stream, so the UI can disable the
 * checkbox / show "imported" state.
 */
export async function GET() {
  if (!hasStoredHikConnectAccount()) {
    return NextResponse.json(
      { error: "No Hik-Connect account configured." },
      { status: 400 }
    );
  }

  try {
    const session = await getActiveHikConnectSession();
    const devices = await listHikConnectDevices(session);

    // Enumerate cameras per device in parallel, tolerating per-device failures.
    const perDevice = await Promise.all(
      devices.map(async (d) => {
        try {
          const cams = await listHikConnectCameras(session, d.deviceSerial);
          return { device: d, cameras: cams, error: null as string | null };
        } catch (err) {
          return {
            device: d,
            cameras: [],
            error: err instanceof Error ? err.message : String(err),
          };
        }
      })
    );

    // Match against existing streams to mark "already imported".
    const existing = new Set(
      streamsRepo
        .list()
        .filter((s) => s.sourceType === "hikconnect" && s.sourceConfig)
        .map(
          (s) =>
            `${s.sourceConfig!.deviceSerial}:${s.sourceConfig!.channelNo}`
        )
    );

    const result = perDevice.map(({ device, cameras, error }) => ({
      deviceSerial: device.deviceSerial,
      deviceName: device.name,
      deviceType: device.deviceType,
      online: device.online,
      version: device.version,
      error,
      cameras: cameras.map((c) => ({
        cameraId: c.cameraId,
        cameraName: c.cameraName,
        channelNo: c.channelNo,
        signalStatus: c.signalStatus,
        alreadyImported: existing.has(`${c.deviceSerial}:${c.channelNo}`),
        hasPreview: c.picUrl !== null,
      })),
    }));

    return NextResponse.json({ devices: result });
  } catch (err) {
    if (err instanceof HikConnectError) {
      return NextResponse.json(
        { error: err.message, kind: err.kind, code: err.code },
        { status: err.kind === "bad-credentials" ? 401 : 502 }
      );
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
