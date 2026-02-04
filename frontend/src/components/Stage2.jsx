import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import './Stage2.css';
import { normalizeMathDelimiters } from '../utils/markdown';

function deAnonymizeText(text, labelToModel) {
  if (!labelToModel) return text;

  let result = text;
  // Replace each "Response X" with the actual model name
  Object.entries(labelToModel).forEach(([label, model]) => {
    const modelShortName = model.split('/')[1] || model;
    result = result.replace(new RegExp(label, 'g'), `**${modelShortName}**`);
  });
  return result;
}

export default function Stage2({ rankings, labelToModel, aggregateRankings, collapsed = false, onToggle, failed = false }) {
  const [activeTab, setActiveTab] = useState(0);

  if ((!rankings || rankings.length === 0) && !failed) {
    return null;
  }

  return (
    <div className={`stage stage2 ${collapsed ? 'stage-collapsed' : ''}`}>
      <button
        type="button"
        className="stage-header"
        onClick={onToggle}
        aria-expanded={!collapsed}
      >
        <span className="stage-toggle-icon">{collapsed ? '▸' : '▾'}</span>
        <span className="stage-title">Stage 2: Peer Rankings</span>
        {failed && <span className="stage-failed">[FAILED]</span>}
      </button>

      <div className="stage-body">
        {(!rankings || rankings.length === 0) ? (
          <div className="stage-failed-message">Stage 2 failed to produce rankings.</div>
        ) : (
          <>
            <h4>Raw Evaluations</h4>
            <p className="stage-description">
              Each model evaluated all responses (anonymized as Response A, B, C, etc.) and provided rankings.
              Below, model names are shown in <strong>bold</strong> for readability, but the original evaluation used anonymous labels.
            </p>

            <div className="tabs">
              {rankings.map((rank, index) => (
                <button
                  key={index}
                  className={`tab ${activeTab === index ? 'active' : ''}`}
                  onClick={() => setActiveTab(index)}
                >
                  {rank.model.split('/')[1] || rank.model}
                </button>
              ))}
            </div>

            <div className="tab-content">
              <div className="ranking-model">
                {rankings[activeTab].model}
              </div>
              <div className="ranking-content markdown-content">
            <ReactMarkdown
              remarkPlugins={[remarkGfm, remarkMath]}
              rehypePlugins={[rehypeRaw, rehypeKatex]}
            >
              {normalizeMathDelimiters(
                deAnonymizeText(rankings[activeTab].ranking, labelToModel)
              )}
            </ReactMarkdown>
              </div>

              {rankings[activeTab].parsed_ranking &&
               rankings[activeTab].parsed_ranking.length > 0 && (
                <div className="parsed-ranking">
                  <strong>Extracted Ranking:</strong>
                  <ol>
                    {rankings[activeTab].parsed_ranking.map((label, i) => (
                      <li key={i}>
                        {labelToModel && labelToModel[label]
                          ? labelToModel[label].split('/')[1] || labelToModel[label]
                          : label}
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </div>

            {aggregateRankings && aggregateRankings.length > 0 && (
              <div className="aggregate-rankings">
                <h4>Aggregate Rankings (Street Cred)</h4>
                <p className="stage-description">
                  Combined results across all peer evaluations (lower score is better):
                </p>
                <div className="aggregate-list">
                  {aggregateRankings.map((agg, index) => (
                    <div key={index} className="aggregate-item">
                      <span className="rank-position">#{index + 1}</span>
                      <span className="rank-model">
                        {agg.model.split('/')[1] || agg.model}
                      </span>
                      <span className="rank-score">
                        Avg: {agg.average_rank.toFixed(2)}
                      </span>
                      <span className="rank-count">
                        ({agg.rankings_count} votes)
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
