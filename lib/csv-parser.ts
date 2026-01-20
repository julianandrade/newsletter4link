/**
 * Parse CSV string to array of objects
 */
export function parseCSV(csvText: string): Array<Record<string, string>> {
  const lines = csvText.trim().split("\n");

  if (lines.length === 0) {
    return [];
  }

  // First line is the header
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());

  const data: Array<Record<string, string>> = [];

  // Parse each data line
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = line.split(",").map((v) => v.trim());

    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = values[index] || "";
    });

    data.push(row);
  }

  return data;
}

/**
 * Parse CSV for subscriber import
 * Expected format: email, name (optional), preferredLanguage (optional), preferredStyle (optional)
 */
export function parseSubscriberCSV(csvText: string): Array<{
  email: string;
  name?: string;
  preferredLanguage?: string;
  preferredStyle?: string;
}> {
  const data = parseCSV(csvText);

  return data.map((row) => ({
    email: row.email || row.Email || "",
    name: row.name || row.Name || undefined,
    preferredLanguage:
      row.preferredlanguage || row.language || row.lang || undefined,
    preferredStyle: row.preferredstyle || row.style || undefined,
  }));
}

/**
 * Validate CSV format for subscribers
 */
export function validateSubscriberCSV(csvText: string): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!csvText || !csvText.trim()) {
    errors.push("CSV file is empty");
    return { valid: false, errors };
  }

  const lines = csvText.trim().split("\n");

  if (lines.length < 2) {
    errors.push("CSV must have at least a header row and one data row");
    return { valid: false, errors };
  }

  // Check for email column
  const headers = lines[0].toLowerCase();
  if (!headers.includes("email")) {
    errors.push(
      "CSV must have an 'email' column (case-insensitive)"
    );
  }

  // Basic validation
  const subscribers = parseSubscriberCSV(csvText);
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  subscribers.forEach((sub, index) => {
    if (!sub.email) {
      errors.push(`Row ${index + 2}: Missing email`);
    } else if (!emailRegex.test(sub.email)) {
      errors.push(`Row ${index + 2}: Invalid email format: ${sub.email}`);
    }
  });

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Generate sample CSV for download
 */
export function generateSampleCSV(): string {
  return `email,name,preferredLanguage,preferredStyle
john.doe@example.com,John Doe,en,comprehensive
maria.silva@example.com,Maria Silva,pt-pt,technical
carlos.rodriguez@example.com,Carlos Rodriguez,es,executive`;
}
