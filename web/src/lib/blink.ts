// Blink as a switch, using MediaPipe Face Landmarker blendshapes in the browser.
// Video never leaves the device. A press fires when both eyes stay closed for at least holdMs,
// which is longer than a natural blink, then the user must open their eyes before the next press.
import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

const WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.0/wasm";
const MODEL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
const CLOSED = 0.55;
const OPEN = 0.3;

export async function startBlinkSwitch(holdMs: number, onPress: () => void, onError: (msg: string) => void): Promise<() => void> {
  let stream: MediaStream;
  let landmarker: FaceLandmarker;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: "user" } });
    const files = await FilesetResolver.forVisionTasks(WASM);
    landmarker = await FaceLandmarker.createFromOptions(files, {
      baseOptions: { modelAssetPath: MODEL, delegate: "GPU" },
      runningMode: "VIDEO",
      outputFaceBlendshapes: true,
      numFaces: 1,
    });
  } catch (e) {
    onError(`Blink switch could not start: ${(e as Error).message}`);
    return () => {};
  }
  const video = document.createElement("video");
  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;
  await video.play();

  let closedSince = 0;
  let armed = true;
  let raf = 0;
  let stopped = false;
  const loop = () => {
    if (stopped) return;
    const res = landmarker.detectForVideo(video, performance.now());
    const shapes = res.faceBlendshapes?.[0]?.categories ?? [];
    const score = (name: string) => shapes.find((c) => c.categoryName === name)?.score ?? 0;
    const both = Math.min(score("eyeBlinkLeft"), score("eyeBlinkRight"));
    const now = performance.now();
    if (both > CLOSED) {
      if (!closedSince) closedSince = now;
      if (armed && now - closedSince >= holdMs) {
        armed = false;
        onPress();
      }
    } else if (both < OPEN) {
      closedSince = 0;
      armed = true;
    }
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
  return () => {
    stopped = true;
    cancelAnimationFrame(raf);
    for (const t of stream.getTracks()) t.stop();
    landmarker.close();
  };
}
