export function OperationLoading({ agenda = false, label }: { agenda?: boolean; label?: string }) {
  return (
    <div className="j2-operation" role="status" aria-busy="true">
      <span className="sr-only">{label ?? (agenda ? "Carregando agenda" : "Carregando painel")}</span>
      <div className="j2-loading-line" aria-hidden />
      <div className="j2-operation-metrics" aria-hidden>
        {Array.from({ length: 4 }, (_, index) => <div key={index}><div className="j2-loading-line" /></div>)}
      </div>
      <div className={agenda ? "j2-agenda-day" : "j2-overview-columns"} aria-hidden>
        {[0, 1].map(index => (
          <div className="j2-operation-panel j2-operation-empty j2-loading-list" key={index}>
            <div className="j2-loading-line" />
            <div className="j2-loading-line" />
            <div className="j2-loading-line" />
          </div>
        ))}
      </div>
    </div>
  );
}
