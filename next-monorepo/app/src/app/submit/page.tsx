"use client";

import { useState } from "react";
import { ShellFrame } from "../shell-frame";

type DraftIntel = {
  id: string;
  category: string;
  severity: number;
  note: string;
};

export default function SubmitPage() {
  const [category, setCategory] = useState("THREAT");
  const [severity, setSeverity] = useState(5);
  const [note, setNote] = useState("");
  const [items, setItems] = useState<DraftIntel[]>([]);

  const onSubmit = () => {
    if (!note.trim()) return;
    const next: DraftIntel = {
      id: `DRAFT-${items.length + 1}`,
      category,
      severity,
      note: note.trim()
    };
    setItems((prev) => [next, ...prev]);
    setNote("");
  };

  return (
    <ShellFrame
      title="INTEL SUBMISSION DESK"
      subtitle="Structured draft submission interface for frontline intel operators."
    >
      <div className="page-grid">
        <section className="column">
          <article className="panel">
            <div className="panel-title">
              <h2>New Report</h2>
              <span>Mock Draft</span>
            </div>
            <div className="grid-2">
              <div>
                <p className="hint">Category</p>
                <select className="select" value={category} onChange={(e) => setCategory(e.target.value)}>
                  <option>THREAT</option>
                  <option>RESOURCE</option>
                  <option>WRECKAGE</option>
                  <option>POPULATION</option>
                </select>
              </div>
              <div>
                <p className="hint">Severity (0-10)</p>
                <input
                  className="input"
                  type="number"
                  min={0}
                  max={10}
                  value={severity}
                  onChange={(e) => setSeverity(Number(e.target.value))}
                />
              </div>
            </div>
            <p className="hint">Report Note</p>
            <textarea
              className="textarea"
              placeholder="Describe anomaly, coordinates, confidence level..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <div className="actions">
              <button className="btn" onClick={onSubmit}>
                Save Draft
              </button>
            </div>
          </article>
        </section>

        <aside className="side">
          <article className="panel">
            <div className="panel-title">
              <h2>Draft Queue</h2>
              <span>{items.length}</span>
            </div>
            <div className="list scroll">
              {items.length === 0 ? <p className="hint">No drafts yet.</p> : null}
              {items.map((item) => (
                <article key={item.id} className="item">
                  <div className="panel-title">
                    <strong>{item.id}</strong>
                    <span>{item.category}</span>
                  </div>
                  <p>Severity: {item.severity}</p>
                  <p>{item.note}</p>
                </article>
              ))}
            </div>
          </article>
        </aside>
      </div>
    </ShellFrame>
  );
}
