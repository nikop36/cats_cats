export type RawSuggestion = {
  title: string;
  description: string;
  time?: string;
  tags?: string[];
};

export default class ActivitySuggestion {
  title: string;
  description: string;
  time: string;
  tags: string[];

  constructor({ title, description, time, tags }: RawSuggestion) {
    this.title = title || "Untitled activity";
    this.description = description || "";
    this.time = time || "";
    this.tags = Array.isArray(tags) ? tags : [];
  }

  static fromJSON(obj: any) {
    if (!obj || typeof obj !== "object")
      throw new Error("Invalid suggestion object");
    return new ActivitySuggestion({
      title: String(obj.title || ""),
      description: String(obj.description || ""),
      time: String(obj.time || ""),
      tags: Array.isArray(obj.tags) ? obj.tags.map(String) : [],
    });
  }
}
