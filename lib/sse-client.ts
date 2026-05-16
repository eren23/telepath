export type SseEvent = { event: string; data: unknown };

export async function* readSse(response: Response): AsyncGenerator<SseEvent> {
  if (!response.body) throw new Error("no response body");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        if (buffer.trim().length > 0) {
          const ev = parseSseMessage(buffer);
          if (ev) yield ev;
        }
        return;
      }
      buffer += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buffer.indexOf("\n\n")) >= 0) {
        const message = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        const ev = parseSseMessage(message);
        if (ev) yield ev;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function parseSseMessage(message: string): SseEvent | null {
  if (!message.trim()) return null;
  let event = "message";
  const dataParts: string[] = [];
  for (const rawLine of message.split("\n")) {
    const line = rawLine.replace(/\r$/, "");
    if (line.startsWith("event:")) {
      event = line.slice(6).trimStart();
    } else if (line.startsWith("data:")) {
      dataParts.push(line.slice(5).trimStart());
    }
  }
  const payload = dataParts.join("\n");
  if (payload.length === 0) return { event, data: null };
  try {
    return { event, data: JSON.parse(payload) };
  } catch {
    return { event, data: payload };
  }
}
