import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import './Stage3.css';
import { normalizeMathDelimiters } from '../utils/markdown';

export default function Stage3({ finalResponse, collapsed = false, onToggle, failed = false }) {
  if (!finalResponse && !failed) {
    return null;
  }

  return (
    <div className={`stage stage3 ${collapsed ? 'stage-collapsed' : ''}`}>
      <button
        type="button"
        className="stage-header"
        onClick={onToggle}
        aria-expanded={!collapsed}
      >
        <span className="stage-toggle-icon">{collapsed ? '▸' : '▾'}</span>
        <span className="stage-title">Stage 3: Final Council Answer</span>
        {failed && <span className="stage-failed">[FAILED]</span>}
      </button>
      <div className="stage-body">
        {!finalResponse ? (
          <div className="stage-failed-message">Stage 3 failed to produce a final response.</div>
        ) : (
          <div className="final-response">
            <div className="chairman-label">
              Chairman: {finalResponse.model.split('/')[1] || finalResponse.model}
            </div>
            <div className="final-text markdown-content">
            <ReactMarkdown
              remarkPlugins={[remarkGfm, remarkMath]}
              rehypePlugins={[rehypeRaw, rehypeKatex]}
            >
              {normalizeMathDelimiters(finalResponse.response)}
            </ReactMarkdown>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
