'use client';

import { AuthProvider, useAuth } from '../auth/AuthProvider';
import { Stage7AuthGate } from '../auth/Stage7AuthGate';
import { FlowProvider, useFlow } from './FlowProvider';
import { Shell } from './Shell';
import { Stage0Landing } from './Stage0Landing';
import { Stage1Identify } from './Stage1Identify';
import { Stage2Facts } from './Stage2Facts';
import { Stage3Converse } from './Stage3Converse';
import { Stage4Confirm } from './Stage4Confirm';
import { Stage5Generate } from './Stage5Generate';
import { Stage6Deliver } from './Stage6Deliver';
import { TweaksPanel } from './TweaksPanel';

function StageRouter() {
  const { state } = useFlow();
  const { user, loading } = useAuth();

  // Login before onboarding: the wizard hits paid, auth-gated endpoints
  // (/api/chat at stage 3, /api/thesis at stage 5). Without a session those
  // 401 mid-flow, so require auth to advance past the public landing (stage 0).
  // Stages 1-2 make no API calls, but gating the whole wizard keeps the rule
  // simple and matches PRD G1 ("no unauthenticated paid endpoints"). The route
  // handlers stay gated server-side regardless — this is just the UX layer.
  if (state.stage >= 1) {
    if (loading) return null; // don't render a stage (or fire its calls) until auth resolves
    if (!user) return <Stage7AuthGate context="start" />;
  }

  switch (state.stage) {
    case 0: return <Stage0Landing />;
    case 1: return <Stage1Identify />;
    case 2: return <Stage2Facts />;
    case 3: return <Stage3Converse />;
    case 4: return <Stage4Confirm />;
    case 5: return <Stage5Generate />;
    case 6: return <Stage6Deliver />;
    default: return null;
  }
}

export function WizardPage({ notice }: { notice?: string }) {
  return (
    <AuthProvider>
      <FlowProvider>
        <Shell>
          {notice && (
            <div
              role="status"
              style={{
                margin: '0 auto 20px',
                maxWidth: 640,
                padding: '10px 14px',
                borderRadius: 8,
                border: '1px solid #fde68a',
                background: '#fffbeb',
                color: '#92400e',
                fontFamily: 'var(--sans)',
                fontSize: 13,
                textAlign: 'center',
              }}
            >
              {notice}
            </div>
          )}
          <StageRouter />
        </Shell>
        <TweaksPanel />
      </FlowProvider>
    </AuthProvider>
  );
}
