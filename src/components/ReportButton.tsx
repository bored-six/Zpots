"use client";

import { useState, type FormEvent } from "react";

import Bilingual from "@/components/Bilingual";
import { FlagIcon } from "@/components/icons/status-icons";
import { bilingualLabel } from "@/lib/copy";
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

const FIELD_LABEL_CLASS =
  "text-xs font-bold uppercase tracking-[0.12em] text-stone-deep";
const CONTROL_CLASS =
  "w-full min-h-11 rounded border border-stone bg-cream px-2.5 py-1.5 text-sm text-ink " +
  "focus:outline-none";

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
        aria-label={bilingualLabel("report")}
        className="inline-flex min-h-10 items-center gap-1.5 rounded border border-cardinal px-2.5 py-1.5 text-xs font-bold uppercase tracking-wide text-cardinal hover:bg-cream-deep"
      >
        <FlagIcon size={14} />
        <Bilingual k="report" />
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex w-full max-w-xs flex-col gap-3 rounded border border-stone bg-cream p-3"
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
          aria-label={bilingualLabel("cancel")}
          className="rounded border border-stone px-3 py-1.5 text-xs font-bold text-ink hover:bg-cream-deep"
        >
          <Bilingual k="cancel" />
        </button>
        <button
          type="submit"
          className="rounded bg-terracotta px-3 py-1.5 text-xs font-bold text-cream hover:bg-terracotta-deep"
        >
          Submit report
        </button>
      </div>
    </form>
  );
}
