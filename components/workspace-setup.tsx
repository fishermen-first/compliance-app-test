import { createWorkspace, saveVessels } from '@/app/actions/setup';

type WorkspaceSetupProps = { step: 'company' | 'vessels'; email?: string | null };

export function WorkspaceSetup({ step, email }: WorkspaceSetupProps) {
  if (step === 'vessels') {
    return (
      <main className="setup-page">
        <section className="setup-panel">
          <div className="setup-brand-row"><span className="brand-mark">FF</span><span>FF Compliance</span></div>
          <p className="eyebrow">Step 2 of 2</p>
          <h1>Add your vessels.</h1>
          <p>Start with the vessels you want to track compliance deadlines for. You can add more later.</p>
          <form action={saveVessels} className="setup-form-real">
            <label>
              Vessel 1
              <input name="vessel1" placeholder="F/V Arctic Storm" required />
            </label>
            <label>
              Vessel 2
              <input name="vessel2" placeholder="F/V Arctic Fjord" />
            </label>
            <label>
              Vessel 3
              <input name="vessel3" placeholder="F/V Sea Storm" />
            </label>
            <button type="submit">Finish setup</button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="setup-page">
      <section className="setup-panel">
        <div className="setup-brand-row"><span className="brand-mark">FF</span><span>FF Compliance</span></div>
        <p className="eyebrow">Step 1 of 2</p>
        <h1>Create your company workspace.</h1>
        <p>This becomes the top-level account for vessels, people, compliance events, reminders, and document links.</p>
        <form action={createWorkspace} className="setup-form-real">
          <label>
            Your name
            <input name="fullName" placeholder="Sarah Nayani" required />
          </label>
          <label>
            Work email
            <input value={email ?? ""} readOnly />
          </label>
          <label>
            Company name
            <input name="companyName" placeholder="Arctic Storm Management Group" required />
          </label>
          <button type="submit">Create workspace</button>
        </form>
      </section>
    </main>
  );
}
