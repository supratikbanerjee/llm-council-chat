import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import './Stage1.css';
import { normalizeMathDelimiters } from '../utils/markdown';

export default function Stage1({ responses, collapsed = false, onToggle, failed = false }) {
  const [activeTab, setActiveTab] = useState(0);

  if ((!responses || responses.length === 0) && !failed) {
    return null;
  }

  return (
    <div className={`stage stage1 ${collapsed ? 'stage-collapsed' : ''}`}>
      <button
        type="button"
        className="stage-header"
        onClick={onToggle}
        aria-expanded={!collapsed}
      >
        <span className="stage-toggle-icon">{collapsed ? '▸' : '▾'}</span>
        <span className="stage-title">Stage 1: Individual Responses</span>
        {failed && <span className="stage-failed">[FAILED]</span>}
      </button>

      <div className="stage-body">
        {(!responses || responses.length === 0) ? (
          <div className="stage-failed-message">Stage 1 failed to produce responses.</div>
        ) : (
          <>
            <div className="tabs">
              {responses.map((resp, index) => (
                <button
                  key={index}
                  className={`tab ${activeTab === index ? 'active' : ''}`}
                  onClick={() => setActiveTab(index)}
                >
                  {resp.model.split('/')[1] || resp.model}
                </button>
              ))}
            </div>

            <div className="tab-content">
              <div className="model-name">{responses[activeTab].model}</div>
              <div className="response-text markdown-content">
              <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkMath]}
                rehypePlugins={[rehypeRaw, rehypeKatex]}
              >
                {normalizeMathDelimiters(responses[activeTab].response)}
              </ReactMarkdown>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
