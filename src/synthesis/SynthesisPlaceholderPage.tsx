interface SynthesisPlaceholderPageProps {
  title: string;
  description: string;
}

export const SynthesisPlaceholderPage = ({ title, description }: SynthesisPlaceholderPageProps): JSX.Element => (
  <section className="synthesis-page-card">
    <h2>{title}</h2>
    <p>{description}</p>
    <p>Placeholder page. The full experience for this route will be added later.</p>
  </section>
);
