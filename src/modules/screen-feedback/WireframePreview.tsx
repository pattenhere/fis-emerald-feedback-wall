import { memo } from "react";

interface WireframePreviewProps {
  title: string;
  caption?: string;
}

export const WireframePreview = memo(({
  title,
  caption = "Representative wireframe only · not final UI",
}: WireframePreviewProps): JSX.Element => {
  return (
    <article className="wireframe-mock ai-treatment">
      <div className="wireframe-window">
        <div className="wireframe-window-bar">
          <div className="wireframe-dots" aria-hidden="true">
            <span className="wireframe-dot" />
            <span className="wireframe-dot" />
            <span className="wireframe-dot" />
          </div>
          <p className="wireframe-window-title">{title}</p>
        </div>
        <div className="wireframe-window-body" aria-hidden="true">
          <div className="wireframe-line wireframe-line-short" />
          <div className="wireframe-line wireframe-line-mid" />
          <div className="wireframe-blocks">
            <div className="wireframe-block" />
            <div className="wireframe-block" />
          </div>
          <div className="wireframe-line wireframe-line-long" />
          <div className="wireframe-line wireframe-line-mid" />
          <div className="wireframe-footer-line">
            <span className="wireframe-footer-dot" />
            <span className="wireframe-footer-stroke" />
          </div>
        </div>
      </div>
      <p className="wireframe-caption">{caption}</p>
    </article>
  );
});
