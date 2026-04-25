'use client';

import { AuthProvider } from './_components/auth/AuthProvider';
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
