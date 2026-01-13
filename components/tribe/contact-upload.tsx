"use client";

import { useCallback, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Upload, FileSpreadsheet, X, AlertCircle, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

export interface ContactRow {
  email: string;
  name?: string;
  phone?: string;
  notes?: string;
  isValid: boolean;
  error?: string;
}

interface ContactUploadProps {
  onUpload: (contacts: ContactRow[]) => Promise<void>;
  disabled?: boolean;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function parseCSV(text: string): ContactRow[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length === 0) return [];

  // Try to detect header row
  const firstLine = lines[0].toLowerCase();
  const hasHeader =
    firstLine.includes("email") ||
    firstLine.includes("name") ||
    firstLine.includes("phone");

  const dataLines = hasHeader ? lines.slice(1) : lines;

  return dataLines
    .map((line) => {
      // Handle quoted values and commas within quotes
      const values: string[] = [];
      let current = "";
      let inQuotes = false;

      for (const char of line) {
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === "," && !inQuotes) {
          values.push(current.trim());
          current = "";
        } else {
          current += char;
        }
      }
      values.push(current.trim());

      const [email = "", name = "", phone = "", notes = ""] = values;

      // Validate email
      const trimmedEmail = email.trim();
      const isValid = isValidEmail(trimmedEmail);

      return {
        email: trimmedEmail,
        name: name.trim() || undefined,
        phone: phone.trim() || undefined,
        notes: notes.trim() || undefined,
        isValid,
        error: !trimmedEmail
          ? "Missing email"
          : !isValid
            ? "Invalid email format"
            : undefined,
      };
    })
    .filter((row) => row.email); // Remove completely empty rows
}

export function ContactUpload({ onUpload, disabled }: ContactUploadProps) {
  const t = useTranslations("contacts");
  const [isDragOver, setIsDragOver] = useState(false);
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validCount = contacts.filter((c) => c.isValid).length;
  const invalidCount = contacts.filter((c) => !c.isValid).length;

  const handleFile = useCallback(async (file: File) => {
    setError(null);

    if (!file.name.endsWith(".csv") && file.type !== "text/csv") {
      setError("Please upload a CSV file");
      return;
    }

    try {
      const text = await file.text();
      const parsed = parseCSV(text);

      if (parsed.length === 0) {
        setError("No valid rows found in CSV");
        return;
      }

      setContacts(parsed);
    } catch {
      setError("Failed to read CSV file");
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      if (disabled) return;

      const file = e.dataTransfer.files[0];
      if (file) {
        handleFile(file);
      }
    },
    [disabled, handleFile]
  );

  const handleSubmit = async () => {
    if (validCount === 0) return;

    setIsUploading(true);
    try {
      await onUpload(contacts.filter((c) => c.isValid));
      setContacts([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setIsUploading(false);
    }
  };

  const handleClear = () => {
    setContacts([]);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <div
        className={cn(
          "relative rounded-xl border-2 border-dashed transition-all duration-200",
          isDragOver
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/30 hover:border-muted-foreground/50",
          disabled && "opacity-50 cursor-not-allowed"
        )}
        onDrop={handleDrop}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setIsDragOver(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setIsDragOver(false);
        }}
      >
        <div className="flex flex-col items-center justify-center gap-3 p-8">
          <div
            className={cn(
              "p-3 rounded-full transition-colors",
              isDragOver ? "bg-primary/10" : "bg-muted"
            )}
          >
            <FileSpreadsheet
              className={cn(
                "w-6 h-6 transition-colors",
                isDragOver ? "text-primary" : "text-muted-foreground"
              )}
            />
          </div>

          <div className="text-center space-y-1">
            <p className="font-medium">
              {isDragOver ? t("dropHere") : t("dragDropCsv")}
            </p>
            <p className="text-sm text-muted-foreground">{t("csvFormat")}</p>
          </div>

          <Button
            type="button"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled}
          >
            <Upload className="w-4 h-4 mr-2" />
            {t("selectFile")}
          </Button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
          className="hidden"
        />
      </div>

      {/* Error message */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Preview table */}
      {contacts.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm">
              <span className="text-green-600 dark:text-green-400">
                {validCount} valid
              </span>
              {invalidCount > 0 && (
                <span className="text-red-600 dark:text-red-400 ml-2">
                  {invalidCount} invalid
                </span>
              )}
            </div>
            <Button variant="ghost" size="sm" onClick={handleClear}>
              <X className="w-4 h-4 mr-1" />
              {t("clear")}
            </Button>
          </div>

          <div className="border rounded-lg overflow-hidden">
            <div className="max-h-64 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 sticky top-0">
                  <tr>
                    <th className="text-left p-2 font-medium w-8"></th>
                    <th className="text-left p-2 font-medium">{t("email")}</th>
                    <th className="text-left p-2 font-medium">{t("name")}</th>
                    <th className="text-left p-2 font-medium hidden sm:table-cell">
                      {t("phone")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {contacts.slice(0, 50).map((contact, i) => (
                    <tr
                      key={i}
                      className={cn(
                        "border-t",
                        !contact.isValid && "bg-red-50 dark:bg-red-950/20"
                      )}
                    >
                      <td className="p-2">
                        {contact.isValid ? (
                          <Check className="w-4 h-4 text-green-600" />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-red-600" />
                        )}
                      </td>
                      <td className="p-2 font-mono text-xs truncate max-w-[200px]">
                        {contact.email}
                        {contact.error && (
                          <span className="text-red-600 ml-1">
                            ({contact.error})
                          </span>
                        )}
                      </td>
                      <td className="p-2 truncate max-w-[150px]">
                        {contact.name || "-"}
                      </td>
                      <td className="p-2 hidden sm:table-cell truncate max-w-[120px]">
                        {contact.phone || "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {contacts.length > 50 && (
              <div className="p-2 text-center text-sm text-muted-foreground bg-muted/30 border-t">
                {t("andMore", { count: contacts.length - 50 })}
              </div>
            )}
          </div>

          <Button
            onClick={handleSubmit}
            disabled={validCount === 0 || isUploading}
            className="w-full"
          >
            {isUploading ? t("uploading") : t("uploadContacts", { count: validCount })}
          </Button>
        </div>
      )}
    </div>
  );
}
