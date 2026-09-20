"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";

import Bilingual from "@/components/Bilingual";
import { AlertIcon } from "@/components/icons/status-icons";
import { bilingualLabel } from "@/lib/copy";
import {
  MAX_NAME_LENGTH,
  MAX_NICKNAME_LENGTH,
  MAX_NOTE_LENGTH,
  validateNewSpot,
  type NewSpotInput,
  type NewSpotValidationErrors,
} from "@/lib/validation";

interface AddSpotFormProps {
  lat: number;
  lng: number;
  onSubmit: (input: NewSpotInput) => void;
  onCancel: () => void;
  /** Initial value for the nickname field, e.g. the signed-in user's account nickname. */
  defaultNickname?: string;
}

const FIELD_LABEL_CLASS =
  "text-xs font-bold uppercase tracking-[0.12em] text-stone-deep";
const FIELD_HELP_CLASS = "text-xs text-stone-deep";
const TEXT_INPUT_CLASS =
  "w-full min-h-11 rounded border border-stone bg-cream px-3 py-2 text-sm text-ink " +
  "placeholder:text-stone-deep focus:outline-none";

function ErrorText({ message }: { message: string }) {
  return (
    <p className="flex items-center gap-1.5 text-[0.8125rem] font-medium text-cardinal">
      <AlertIcon className="shrink-0" />
      <span>{message}</span>
    </p>
  );
}

/**
 * Short, calm form for dropping a pin: name, note, an optional nickname,
 * and a required photo. Lat/lng arrive as props (the map already knows
 * where the tap landed) so this form never has to ask for a location.
 */
export default function AddSpotForm({
  lat,
  lng,
  onSubmit,
  onCancel,
  defaultNickname,
}: AddSpotFormProps) {
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [nickname, setNickname] = useState(defaultNickname ?? "");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<NewSpotValidationErrors>({});

  function handlePhotoChange(event: ChangeEvent<HTMLInputElement>) {
    setPhotoFile(event.target.files?.[0] ?? null);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedNickname = nickname.trim();

    const result = validateNewSpot({
      name,
      note,
      lat,
      lng,
      nickname: trimmedNickname || undefined,
      photoFile,
    });

    if (!result.valid) {
      setErrors(result.errors);
      return;
    }

    setErrors({});
    onSubmit({
      name,
      note,
      lat,
      lng,
      photoFile,
      ...(trimmedNickname ? { nickname: trimmedNickname } : {}),
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full max-w-sm flex-col gap-4">
      <h2
        className="text-xl font-bold text-ink"
        style={{ fontFamily: "var(--font-display)" }}
      >
        <Bilingual k="addSpot" />
      </h2>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="spot-name" className={FIELD_LABEL_CLASS}>
          Name
        </label>
        <input
          id="spot-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="What do locals call this place?"
          maxLength={MAX_NAME_LENGTH + 20}
          className={TEXT_INPUT_CLASS}
        />
        {errors.name && <ErrorText message={errors.name} />}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="spot-note" className={FIELD_LABEL_CLASS}>
          Note
        </label>
        <textarea
          id="spot-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="A short line for someone standing here for the first time."
          rows={3}
          maxLength={MAX_NOTE_LENGTH + 20}
          className={`${TEXT_INPUT_CLASS} resize-none`}
        />
        {errors.note && <ErrorText message={errors.note} />}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="spot-nickname" className={FIELD_LABEL_CLASS}>
          Nickname (optional)
        </label>
        <input
          id="spot-nickname"
          type="text"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          placeholder="Shown next to your pin -- never a verified identity."
          maxLength={MAX_NICKNAME_LENGTH + 10}
          className={TEXT_INPUT_CLASS}
        />
        {errors.nickname && <ErrorText message={errors.nickname} />}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="spot-photo" className={FIELD_LABEL_CLASS}>
          Photo
        </label>
        <div className="rounded border border-dashed border-stone bg-cream p-3 hover:bg-cream-deep">
          <input
            id="spot-photo"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            onChange={handlePhotoChange}
            className="block w-full text-sm text-ink file:mr-3 file:rounded file:border-0 file:bg-terracotta file:px-3 file:py-2 file:text-sm file:font-bold file:text-cream hover:file:bg-terracotta-deep"
          />
        </div>
        <p className={FIELD_HELP_CLASS}>JPEG, PNG, WEBP, or GIF, under 5MB.</p>
        {errors.photoFile && <ErrorText message={errors.photoFile} />}
      </div>

      <div className="mt-1 flex justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          aria-label={bilingualLabel("cancel")}
          className="inline-flex min-h-10 items-center rounded border border-stone px-4 py-2 text-sm font-bold text-ink hover:bg-cream-deep"
        >
          <Bilingual k="cancel" />
        </button>
        <button
          type="submit"
          className="inline-flex min-h-10 items-center rounded bg-terracotta px-4 py-2 text-sm font-bold text-cream hover:bg-terracotta-deep"
        >
          Add pin
        </button>
      </div>
    </form>
  );
}
