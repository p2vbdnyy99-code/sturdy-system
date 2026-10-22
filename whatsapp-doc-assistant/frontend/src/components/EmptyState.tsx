// Genuinely generic — no tender/business logic here. The caller decides the
// copy and whether an action is offered (per the explicit correction that
// this must stay reusable across pages, not dashboard-specific).
type EmptyStateProps = {
  title: string;
  message?: string;
  action?: { label: string; onClick: () => void };
};

export function EmptyState({ title, message, action }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <p className="empty-state-title">{title}</p>
      {message && <p className="muted">{message}</p>}
      {action && (
        <button type="button" onClick={action.onClick} className="submit-button">
          {action.label}
        </button>
      )}
    </div>
  );
}
