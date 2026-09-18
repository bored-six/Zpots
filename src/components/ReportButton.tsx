"use client";

import { useState, type FormEvent } from "react";

import { FlagIcon } from "@/components/icons/status-icons";
import {
  MAX_REPORT_DETAILS_LENGTH,
  REPORT_REASONS,
  type ReportReason,
} from "@/lib/validation";

interface ReportButtonProps {
  spotId: string;
  onReport: (reason: ReportReason, details?: string) => void;
}

const REASON_LABELS: Record<ReportReason, string> = {
  spam: "Spam",
  wrong_info: "Wrong info",
  closed: "Closed",
};

const FIELD_LABEL_CLASS = "text-xs font-medium text-[#6f6b60]";
const CONTROL_CLASS =
  "w-full rounded-sm border border-[#d8d4cb] bg-white px-2.5 py-1.5 text-sm text-[#1f2420] " +
  "focus:border-[#7a7368] focus:outline-none focus:ring-2 focus:ring-[#7a7368]/25";

/**
 * Quiet "Report" trigger that opens into a small reason + optional
 * details form. Reporting is a signal, not an instant delete
 * (product.md) -- the control stays understated on purpose.
 */
export default function ReportButton({ spotId, onReport }: ReportButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason>(REPORT_REASONS[0]);
  const [details, setDetails] = useState("");

  function close() {
    setIsOpen(false);
    setReason(REPORT_REASONS[0]);
    setDetails("");
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedDetails = details.trim();
    onReport(reason, trimmedDetails ? trimmedDetails : undefined);
    close();
  }

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-sm px-2 py-1 text-xs font-medium text-[#7a7368] hover:bg-[#f1efe9]"
      >
        <FlagIcon size={14} />
        Report
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex w-full max-w-xs flex-col gap-3 rounded-sm border border-[#e4e1d8] bg-white p-3"
    >
      <div className="flex flex-col gap-1">
        <label htmlFor={`report-reason-${spotId}`} className={FIELD_LABEL_CLASS}>
          Reason
        </label>
        <select
          id={`report-reason-${spotId}`}
          value={reason}
          onChange={(e) => setReason(e.target.value as ReportReason)}
          className={CONTROL_CLASS}
        >
          {REPORT_REASONS.map((r) => (
            <option key={r} value={r}>
              {REASON_LABELS[r]}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor={`report-details-${spotId}`} className={FIELD_LABEL_CLASS}>
          Details (optional)
        </label>
        <textarea
          id={`report-details-${spotId}`}
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          maxLength={MAX_REPORT_DETAILS_LENGTH}
          rows={2}
          className={`${CONTROL_CLASS} resize-none`}
        />
      </div>

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={close}
          className="rounded-sm px-3 py-1.5 text-xs font-medium text-[#6f6b60] hover:bg-[#f1efe9]"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="rounded-sm bg-[#7a7368] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#635e54]"
        >
          Submit report
        </button>
      </div>
    </form>
  );
}
