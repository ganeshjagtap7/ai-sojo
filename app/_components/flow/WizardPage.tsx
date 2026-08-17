'use client';

import { useEffect } from 'react';
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
  const { state, dispatch } = useFlow();
  const { user, loading } = useAuth();

  // Stage 0 is the anonymous marketing landing (email capture) — it exists only
  // to collect an email from logged-out visitors before signup. A signed-in
  // user doesn't need it (and it looks like a logged-out page), so once auth
  // resolves, skip them straight into Stage 1. Anonymous users are untouched.
  useEffect(() => {
    if (!loading && user && state.stage === 0) {
      dispatch({ type: 'SET_STAGE', stage: 1 });
    }
  }, [loading, user, state.stage, dispatch]);

  // Login before onboarding. Where the gate sits is flag-controlled:
  //   OFF (default) — today's live behavior. Gate at stage 1, right after the
  //     public landing (stage 0). Simple: the whole wizard is auth-only.
  //   ON — the Phase 1 redesign. Stages 1-2 (archetype, five fast facts) make
  //     no API calls, so a visitor completes them free; the gate moves to
  //     stage 3, right before /api/chat — maximum sunk effort, minimum cost.
  // /api/chat (stage 3) and /api/thesis (stage 5) are auth-gated server-side
  // regardless of this flag — this only changes where the UX layer asks.
  const gateAtStage3 = process.env.NEXT_PUBLIC_ENABLE_AUTH_GATE_STAGE3 === 'true';
  const gateThreshold = gateAtStage3 ? 3 : 1;
  if (state.stage >= gateThreshold) {
    if (loading) return null; // don't render a stage (or fire its calls) until auth resolves
    if (!user) return <Stage7AuthGate context={gateAtStage3 ? 'claim' : 'start'} />;
  }

  // Don't flash the Stage 0 hero to a signed-in user while the effect above
  // bumps them to Stage 1.
  if (!loading && user && state.stage === 0) return null;

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
