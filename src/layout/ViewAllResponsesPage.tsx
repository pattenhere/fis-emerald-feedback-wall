import { memo } from "react";

export interface ViewAllCategorySection {
  type: "Feedback" | "Feature Requests" | "Kudos";
  items: Array<{
    id: string;
    title: string;
    detail: string;
  }>;
}

export interface ViewAllCategoryGroup {
  category: string;
  totalCount: number;
  sections: ViewAllCategorySection[];
}

interface ViewAllResponsesPageProps {
  groups: ViewAllCategoryGroup[];
}

export const ViewAllResponsesPage = memo(({
  groups,
}: ViewAllResponsesPageProps): JSX.Element => {
  return (
    <section className="view-all-page">
      <header className="view-all-head">
        <h2>All Responses</h2>
        <p>Feedback, feature requests, and kudos organized by category.</p>
      </header>

      {groups.length === 0 ? (
        <p className="view-all-empty">No responses captured yet.</p>
      ) : (
        <div className="view-all-groups">
          {groups.map((group) => (
            <article key={group.category} className="view-all-group">
              <h3>
                {group.category} ({group.totalCount})
              </h3>
              {group.sections.map((section) => (
                <div key={`${group.category}-${section.type}`} className="view-all-section">
                  <h4>{section.type}</h4>
                  <table className="view-all-table">
                    <thead>
                      <tr>
                        <th>Item</th>
                        <th>Detail</th>
                      </tr>
                    </thead>
                    <tbody>
                      {section.items.map((item) => (
                        <tr key={item.id}>
                          <td>{item.title}</td>
                          <td>{item.detail}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </article>
          ))}
        </div>
      )}
    </section>
  );
});
