export class ReplyFormatter {
  constructor(private readonly maxLength = 2000) {}

  chunk(text: string): string[] {
    if (text.length <= this.maxLength) {
      return [text]
    }

    const chunks: string[] = []
    let remaining = text

    while (remaining.length > this.maxLength) {
      const slice = remaining.slice(0, this.maxLength)
      const breakAt = Math.max(slice.lastIndexOf("\n"), slice.lastIndexOf(" "))
      const splitPoint = breakAt > 0 ? breakAt : this.maxLength
      chunks.push(remaining.slice(0, splitPoint).trimEnd())
      remaining = remaining.slice(splitPoint).trimStart()
    }

    if (remaining.length > 0) {
      chunks.push(remaining)
    }

    return chunks
  }
}
