'use client';

import { AuthProvider, useAuth } from './_components/auth/AuthProvider';
import { Stage7AuthGate } from './_components/auth/Stage7AuthGate';
import { FlowProvider, useFlow } from './_components/flow/FlowProvider';
import { Shell } from './_components/flow/Shell';
import { Stage0Landing } from './_components/flow/Stage0Landing';
import { Stage1Identify } from './_components/flow/Stage1Identify';
import { Stage2Facts } from './_components/flow/Stage2Facts';
import { Stage3Converse } from './_components/flow/Stage3Converse';
import { Stage4Confirm } from './_components/flow/Stage4Confirm';
import { Stage5Generate } from './_components/flow/Stage5Generate';
import { Stage6Deliver } from './_components/flow/Stage6Deliver';
import { TweaksPanel } from './_components/flow/TweaksPanel';

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

export default function Page() {
  return (
    <AuthProvider>
      <FlowProvider>
        <Shell>
          <StageRouter />
        </Shell>
        <TweaksPanel />
      </FlowProvider>
    </AuthProvider>
  );
}
