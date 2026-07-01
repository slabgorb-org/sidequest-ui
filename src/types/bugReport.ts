export interface BugReportContext {
  sessionSlug?: string;
  genre?: string;
  world?: string;
  /** connect | creation | game */
  screen?: string;
}

export interface BugReportResponse {
  issue_url: string;
  issue_number: number;
  report_id: string;
}
