"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";

import { AlertIcon } from "@/components/icons/status-icons";
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

const FIELD_LABEL_CLASS = "text-sm font-medium text-[#3a3730]";
const FIELD_HELP_CLASS = "text-xs text-[#8a8579]";
const TEXT_INPUT_CLASS =
  "w-full rounded-sm border border-[#d8d4cb] bg-white px-3 py-2 text-sm text-[#1f2420] " +
  "placeholder:text-[#a9a498] focus:border-[var(--zpots-brass)] focus:outline-none focus:ring-2 " +
  "focus:ring-[var(--zpots-brass)]/25";

function ErrorText({ message }: { message: string }) {
  return (
    <p className="flex items-center gap-1.5 text-sm font-medium text-[#9a3324]">
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
        <input
          id="spot-photo"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          onChange={handlePhotoChange}
          className="block w-full text-sm text-[#3a3730] file:mr-3 file:rounded-sm file:border-0 file:bg-[var(--zpots-brass)] file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:brightness-90"
        />
        <p className={FIELD_HELP_CLASS}>JPEG, PNG, WEBP, or GIF, under 5MB.</p>
        {errors.photoFile && <ErrorText message={errors.photoFile} />}
      </div>

      <div className="mt-1 flex justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-sm px-4 py-2 text-sm font-medium text-[#3a3730] hover:bg-[#f1efe9]"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="rounded-sm bg-[var(--zpots-brass)] px-4 py-2 text-sm font-semibold text-white hover:brightness-90"
        >
          Add pin
        </button>
      </div>
    </form>
  );
}
