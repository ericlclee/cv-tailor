import { ActivityPanel } from "@/components/workspace/activity-panel";
import { ProfileDocument } from "@/components/workspace/profile-doc";

export default function Home() {
  return (
    <>
      <ProfileDocument />
      <ActivityPanel
        scope={null}
        context="Master profile"
        prompts={["Help me build my CV Tailor profile. Here's my CV.", "Ask me questions to strengthen my CV Tailor profile."]}
      />
    </>
  );
}
