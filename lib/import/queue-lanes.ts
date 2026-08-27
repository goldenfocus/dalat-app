export const AUTO_IMPORT_QUEUE_TYPES = ["url", "text"] as const;
export const MANUAL_REVIEW_QUEUE_TYPE = "image";

export function isAutoImportQueueType(type: string): boolean {
  return (AUTO_IMPORT_QUEUE_TYPES as readonly string[]).includes(type);
}
