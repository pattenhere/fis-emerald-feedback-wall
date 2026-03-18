import { memo } from "react";

interface ScrimProps {
  visible: boolean;
  onClick: () => void;
  coverSubmittedFeedback: boolean;
}

export const Scrim = memo(({
  visible,
  onClick,
  coverSubmittedFeedback,
}: ScrimProps): JSX.Element => {
  return (
    <button
      type="button"
      className={`newui-scrim ${visible ? "is-visible" : ""} ${coverSubmittedFeedback ? "cover-feedback" : "no-feedback-cover"}`}
      onClick={onClick}
      aria-hidden={!visible}
      aria-label="Close panel overlay"
      tabIndex={visible ? 0 : -1}
    />
  );
});
