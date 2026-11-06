import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { SettingSwitch, SignOut } from '@/components/controls';
import { SettingsForm, ThemeControl } from '@/components/Forms';
import { Page, PageHead, SettingGroup } from '@/components/ui';
import { lastEmailProblem } from '@/lib/notify/email';
import { SLOTS } from '@/lib/schedule';
import { getSettings } from '@/lib/settings';

export const metadata: Metadata = { title: 'Search settings' };

export default async function SettingsPage() {
  const [s, emailProblem] = await Promise.all([getSettings(), lastEmailProblem()]);
  const plain = JSON.parse(JSON.stringify(s));
  const theme = (await cookies()).get('theme')?.value;
  return (
    <Page>
      <PageHead title="Search settings" intro="Sri Lanka is always searched. These settings apply to scheduled searches and to Search now." />
      <SettingGroup id="agent" title="Agent and scope" hint="Switches save straight away.">
        <div className="divide-y divide-line">
          <SettingSwitch field="agent_enabled" initial={s.agent_enabled} label="Surelane agent" hint="Off stops every search and every job email." />
          <SettingSwitch field="global_enabled" initial={s.global_enabled} label="Include Global Job Opportunities" hint="Adds overseas and international remote roles." />
          <SettingSwitch field="email_enabled" initial={s.email_enabled} label="Email me new matches" hint="Sent after scheduled searches." />
        </div>
      </SettingGroup>
      <SettingGroup id="schedule" title="Daily schedule" hint="Sri Lanka time. Turn each search on or off.">
        <div className="divide-y divide-line">
          {SLOTS.map((slot) => <SettingSwitch key={slot.key} field={slot.field} initial={Boolean(s[slot.field as keyof typeof s])} label={slot.label} />)}
        </div>
      </SettingGroup>
      <SettingsForm s={plain} emailProblem={emailProblem} />
      <SettingGroup id="appearance" title="Appearance"><ThemeControl initial={theme} /></SettingGroup>
      <SettingGroup id="account" title="Account"><SignOut className="btn btn-quiet" /></SettingGroup>
    </Page>
  );
}
