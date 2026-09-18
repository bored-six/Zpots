import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import AddSpotForm from "@/components/AddSpotForm";
import { MAX_NOTE_LENGTH, MAX_NAME_LENGTH } from "@/lib/validation";

const LAT = 6.9098;
const LNG = 122.079;

function makeImageFile(name = "photo.jpg"): File {
  return new File([new Uint8Array(1024)], name, { type: "image/jpeg" });
}

// Field lookup helpers. We deliberately avoid a loose /name/i regex for the
// "name" field because "Nickname" also contains the substring "name" and
// would make getByLabelText ambiguous -- exact (trimmed, case-insensitive)
// label text is used instead for name/note, and a plain type="file" query
// for the photo input so we don't depend on its label wording at all.
function getNameInput() {
  return screen.getByLabelText((content) => content.trim().toLowerCase() === "name");
}
function getNoteInput() {
  return screen.getByLabelText((content) => content.trim().toLowerCase() === "note");
}
function getNicknameInput() {
  return screen.getByLabelText((content) => content.toLowerCase().includes("nickname"));
}
function getPhotoInput(container: HTMLElement) {
  const input = container.querySelector('input[type="file"]');
  if (!input) throw new Error("Expected a file input for the photo field");
  return input as HTMLInputElement;
}
function getCancelButton() {
  return screen.getByRole("button", { name: /cancel/i });
}
function getSubmitButton(container: HTMLElement) {
  const button = container.querySelector('button[type="submit"]');
  if (!button) throw new Error("Expected a submit button (button[type=submit])");
  return button as HTMLButtonElement;
}

async function fillValidFormAndReturnButtons(container: HTMLElement) {
  await userEvent.type(getNameInput(), "Rio Hondo Boardwalk");
  await userEvent.type(getNoteInput(), "Great sunset view, watch your step.");
  await userEvent.upload(getPhotoInput(container), makeImageFile());
  return { submit: getSubmitButton(container) };
}

describe("AddSpotForm", () => {
  it("renders name, note, nickname, and photo inputs plus submit and cancel controls", () => {
    const { container } = render(
      <AddSpotForm lat={LAT} lng={LNG} onSubmit={vi.fn()} onCancel={vi.fn()} />,
    );

    expect(getNameInput()).toBeInTheDocument();
    expect(getNoteInput()).toBeInTheDocument();
    expect(getNicknameInput()).toBeInTheDocument();
    expect(getPhotoInput(container)).toBeInTheDocument();
    expect(getSubmitButton(container)).toBeInTheDocument();
    expect(getCancelButton()).toBeInTheDocument();
  });

  it("calls onCancel exactly once when Cancel is clicked, and never calls onSubmit", async () => {
    const onSubmit = vi.fn();
    const onCancel = vi.fn();
    render(<AddSpotForm lat={LAT} lng={LNG} onSubmit={onSubmit} onCancel={onCancel} />);

    await userEvent.click(getCancelButton());

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("does not call onSubmit and shows inline error text when submitted with an empty name", async () => {
    const onSubmit = vi.fn();
    const { container } = render(
      <AddSpotForm lat={LAT} lng={LNG} onSubmit={onSubmit} onCancel={vi.fn()} />,
    );

    await userEvent.type(getNoteInput(), "A valid note.");
    await userEvent.upload(getPhotoInput(container), makeImageFile());
    await userEvent.click(getSubmitButton(container));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(container.textContent?.toLowerCase()).toMatch(/required|enter|invalid|must|name/);
  });

  it("does not call onSubmit when no photo is selected (photo is required per the brief)", async () => {
    const onSubmit = vi.fn();
    const { container } = render(
      <AddSpotForm lat={LAT} lng={LNG} onSubmit={onSubmit} onCancel={vi.fn()} />,
    );

    await userEvent.type(getNameInput(), "Rio Hondo Boardwalk");
    await userEvent.type(getNoteInput(), "A valid note.");
    await userEvent.click(getSubmitButton(container));

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("does not call onSubmit when the name exceeds MAX_NAME_LENGTH characters", async () => {
    const onSubmit = vi.fn();
    const { container } = render(
      <AddSpotForm lat={LAT} lng={LNG} onSubmit={onSubmit} onCancel={vi.fn()} />,
    );

    await userEvent.type(getNameInput(), "a".repeat(MAX_NAME_LENGTH + 1));
    await userEvent.type(getNoteInput(), "A valid note.");
    await userEvent.upload(getPhotoInput(container), makeImageFile());
    await userEvent.click(getSubmitButton(container));

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("does not call onSubmit when the note exceeds MAX_NOTE_LENGTH characters", async () => {
    const onSubmit = vi.fn();
    const { container } = render(
      <AddSpotForm lat={LAT} lng={LNG} onSubmit={onSubmit} onCancel={vi.fn()} />,
    );

    await userEvent.type(getNameInput(), "Rio Hondo Boardwalk");
    await userEvent.type(getNoteInput(), "n".repeat(MAX_NOTE_LENGTH + 1));
    await userEvent.upload(getPhotoInput(container), makeImageFile());
    await userEvent.click(getSubmitButton(container));

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("calls onSubmit exactly once with the assembled NewSpotInput including the given lat/lng when valid", async () => {
    const onSubmit = vi.fn();
    const { container } = render(
      <AddSpotForm lat={LAT} lng={LNG} onSubmit={onSubmit} onCancel={vi.fn()} />,
    );

    const { submit } = await fillValidFormAndReturnButtons(container);
    await userEvent.click(submit);

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const submitted = onSubmit.mock.calls[0][0];
    expect(submitted.name).toBe("Rio Hondo Boardwalk");
    expect(submitted.note).toBe("Great sunset view, watch your step.");
    expect(submitted.lat).toBe(LAT);
    expect(submitted.lng).toBe(LNG);
    expect(submitted.photoFile).toBeInstanceOf(File);
  });

  it("includes a nickname in the submitted input when one is provided", async () => {
    const onSubmit = vi.fn();
    const { container } = render(
      <AddSpotForm lat={LAT} lng={LNG} onSubmit={onSubmit} onCancel={vi.fn()} />,
    );

    await userEvent.type(getNameInput(), "Rio Hondo Boardwalk");
    await userEvent.type(getNoteInput(), "Great sunset view, watch your step.");
    await userEvent.type(getNicknameInput(), "chabelita");
    await userEvent.upload(getPhotoInput(container), makeImageFile());
    await userEvent.click(getSubmitButton(container));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0].nickname).toBe("chabelita");
  });
});
