import { useState } from 'react';
import './index.css';

// Mock Data
const MOCK_SEGMENTS = [
  {
    id: 'seg-1',
    symbol: 'validate_user_input',
    language: 'rust',
    code: `pub fn validate_user_input(input: &str) -> bool {
    if input.is_empty() { return false; }
    if input.len() > 255 { return false; }
    // Check for special characters
    if input.contains(&['<', '>', '&', '%'][..]) {
        return false;
    }
    true
}`,
    findings: [
      { id: 'f1', type: 'bug', title: 'Inefficient array search', desc: 'Using contains with a slice array creates unnecessary overhead in hot paths.' },
      { id: 'f2', type: 'security', title: 'Incomplete XSS Filter', desc: 'Missing quotes and backticks in the sanitize filter.' }
    ]
  },
  {
    id: 'seg-2',
    symbol: 'User::new',
    language: 'rust',
    code: `impl User {
    pub fn new(email: String, password_hash: String) -> Self {
        Self {
            id: Uuid::new_v4(),
            email,
            password_hash,
            created_at: Utc::now(),
        }
    }
}`,
    findings: [
      { id: 'f3', type: 'info', title: 'Standard Initialization', desc: 'Code looks clean and follows idioms.'}
    ]
  }
];

function App() {
  const [activeSegmentId, setActiveSegmentId] = useState<string>(MOCK_SEGMENTS[0].id);
  const [simulating, setSimulating] = useState(false);
  const [mockOutput, setMockOutput] = useState<string | null>(null);

  const activeSegment = MOCK_SEGMENTS.find(s => s.id === activeSegmentId);

  const handleMockExecute = () => {
    setSimulating(true);
    setMockOutput(null);
    
    // Simulate network delay and execution
    setTimeout(() => {
      setSimulating(false);
      if (activeSegment?.symbol === 'validate_user_input') {
        setMockOutput(
`[Mock Engine: Runtime Simulator]
> fn: validate_user_input
> args: input = "<script>alert(1)</script>"

Execution Trace:
1. input.is_empty() -> false
2. input.len() > 255 -> false
3. input.contains(...) -> true
Return => false

Result: Passed ✅ (Sanitizer triggered correctly)`
        );
      } else {
        setMockOutput(`[Mock Engine] Executed ${activeSegment?.symbol} successfully.\nState: Initialized.`);
      }
    }, 1500);
  };

  return (
    <div className="cat-container">
      <header className="cat-header">
        <h1>CodeCAT <span style={{fontSize: '0.8rem', color: 'var(--text-muted)'}}>Review Platform v0.1</span></h1>
      </header>
      
      <div className="cat-main-area">
        <div className="cat-editor">
          {/* LEFT: SOURCE CODE */}
          <section className="cat-pane">
            <div className="pane-header">
              <span>Source Segments</span>
              <button className="btn btn-secondary">Sync from Git</button>
            </div>
            <div className="pane-content">
              {MOCK_SEGMENTS.map(seg => (
                <div 
                  key={seg.id} 
                  className={`code-segment-item ${activeSegmentId === seg.id ? 'active' : ''}`}
                  onClick={() => setActiveSegmentId(seg.id)}
                >
                  <div className="segment-header">
                    <span>{seg.symbol}</span>
                    <span style={{textTransform:'uppercase', fontSize:'0.7rem'}}>{seg.language}</span>
                  </div>
                  <pre>{seg.code}</pre>
                </div>
              ))}
            </div>
          </section>

          {/* RIGHT: REVIEW & MOCK */}
          <section className="cat-pane">
            <div className="pane-header">
              <span>Review Translation & Context</span>
            </div>
            <div className="pane-content">
              {activeSegment ? (
                <>
                  <div className="mock-panel">
                    <div className="mock-panel-header">
                      <div className="mock-title">
                        <span>⚡ Mock Execution Engine</span>
                        <span className="mock-badge">Experimental</span>
                      </div>
                      <button 
                        className="btn" 
                        style={{background: 'var(--success)'}}
                        onClick={handleMockExecute}
                        disabled={simulating}
                      >
                        {simulating ? 'Simulating...' : 'Run Mock Execute'}
                      </button>
                    </div>
                    {mockOutput && (
                      <div className="mock-output">
                        {mockOutput}
                      </div>
                    )}
                  </div>

                  {activeSegment.findings.map(finding => (
                    <div key={finding.id} className="review-card" style={{borderLeft: `4px solid ${finding.type === 'bug' ? 'var(--danger)' : finding.type === 'security' ? 'var(--warning)' : 'var(--accent)'}`}}>
                      <h3>
                        <span style={{textTransform:'uppercase', fontSize:'0.7rem', padding:'2px 6px', background:'var(--bg-dark)', borderRadius:'4px'}}>
                          {finding.type}
                        </span>
                        {finding.title}
                      </h3>
                      <p>{finding.desc}</p>
                      
                      <div style={{marginTop: '12px', display: 'flex', gap: '8px'}}>
                        <button className="btn btn-secondary" style={{padding: '4px 8px', fontSize: '0.75rem'}}>Accept</button>
                        <button className="btn btn-secondary" style={{padding: '4px 8px', fontSize: '0.75rem'}}>Ignore</button>
                      </div>
                    </div>
                  ))}
                </>
              ) : (
                <p>Select a segment to review.</p>
              )}
            </div>
          </section>
        </div>

        {/* CHAT PANEL */}
        <aside className="cat-chat">
          <div className="pane-header">
            <span>RAG Assistant</span>
          </div>
          <div className="chat-messages">
            <div className="chat-bubble assistant">
              Hello! I'm your CodeCAT assistant. I've analyzed the current repository using our RAG pipeline. How can I help you with the review?
            </div>
          </div>
          <div className="chat-input-area">
            <input type="text" className="chat-input" placeholder="Ask about architecture, dependencies..." />
          </div>
        </aside>
      </div>
    </div>
  );
}

export default App;
