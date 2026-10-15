// Small PCM helpers shared by the transports.

/** Strips a RIFF/WAVE header from the front of a byte stream and passes PCM through. */
export class WavStripper {
  private head = Buffer.alloc(0);
  private done = false;
  private carry: Buffer | null = null;

  /** Feed bytes; returns PCM16 bytes ready to use (always an even length). */
  push(chunk: Buffer): Buffer {
    let data = chunk;
    if (!this.done) {
      this.head = Buffer.concat([this.head, chunk]);
      if (this.head.length < 12) return Buffer.alloc(0);
      if (this.head.subarray(0, 4).toString("ascii") !== "RIFF") {
        // Not a WAV stream: treat everything as raw PCM.
        this.done = true;
        data = this.head;
      } else {
        const idx = this.head.indexOf("data", 12, "ascii");
        if (idx < 0 || this.head.length < idx + 8) return Buffer.alloc(0);
        this.done = true;
        data = this.head.subarray(idx + 8);
      }
      this.head = Buffer.alloc(0);
    }
    return this.even(data);
  }

  private even(data: Buffer): Buffer {
    if (this.carry) {
      data = Buffer.concat([this.carry, data]);
      this.carry = null;
    }
    if (data.length % 2 === 1) {
      this.carry = data.subarray(data.length - 1);
      data = data.subarray(0, data.length - 1);
    }
    return data;
  }
}

/** Parses a complete WAV file and returns its PCM payload and sample rate. */
export function parseWav(buf: Buffer): { pcm: Buffer; sampleRate: number; channels: number } {
  if (buf.subarray(0, 4).toString("ascii") !== "RIFF") return { pcm: buf, sampleRate: 0, channels: 1 };
  let off = 12;
  let sampleRate = 0;
  let channels = 1;
  while (off + 8 <= buf.length) {
    const id = buf.subarray(off, off + 4).toString("ascii");
    const size = buf.readUInt32LE(off + 4);
    if (id === "fmt ") {
      channels = buf.readUInt16LE(off + 10);
      sampleRate = buf.readUInt32LE(off + 12);
    }
    if (id === "data") {
      const end = size === 0 || size === 0xffffffff ? buf.length : Math.min(buf.length, off + 8 + size);
      return { pcm: buf.subarray(off + 8, end), sampleRate, channels };
    }
    off += 8 + size + (size % 2);
  }
  return { pcm: Buffer.alloc(0), sampleRate, channels };
}

/** Wraps PCM16 mono in a WAV header. */
export function wavFromPcm(pcm: Buffer, sampleRate: number): Buffer {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0, "ascii");
  h.writeUInt32LE(36 + pcm.length, 4);
  h.write("WAVE", 8, "ascii");
  h.write("fmt ", 12, "ascii");
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(sampleRate, 24);
  h.writeUInt32LE(sampleRate * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36, "ascii");
  h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

/** Linear resample of PCM16 mono. Good enough for feeding speech recognition. */
export function resamplePcm16(pcm: Buffer, from: number, to: number): Buffer {
  if (from === to) return pcm;
  const inSamples = pcm.length >> 1;
  const outSamples = Math.floor((inSamples * to) / from);
  const out = Buffer.alloc(outSamples * 2);
  const ratio = from / to;
  for (let i = 0; i < outSamples; i++) {
    const pos = i * ratio;
    const i0 = Math.floor(pos);
    const i1 = Math.min(inSamples - 1, i0 + 1);
    const frac = pos - i0;
    const s = pcm.readInt16LE(i0 * 2) * (1 - frac) + pcm.readInt16LE(i1 * 2) * frac;
    out.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(s))), i * 2);
  }
  return out;
}
