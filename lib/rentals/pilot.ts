export const rentalReelCaptionKeys = ["opening", "bedroom", "coffee", "water", "endCard"] as const;
export const rentalReelShotSeconds = 4;

function timestamp(seconds: number) {
  return `00:${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}.000`;
}

export function rentalReelWebVtt(captions: readonly string[]) {
  const cues = captions.map((caption, index) => {
    const start = timestamp(index * rentalReelShotSeconds);
    const end = timestamp((index + 1) * rentalReelShotSeconds);
    return `${start} --> ${end} line:78%\n${caption}`;
  });
  return `WEBVTT\n\n${cues.join("\n\n")}\n`;
}
