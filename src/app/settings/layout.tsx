import { SettingsCenterPage } from '@/components/settings/SettingsCenterPage';

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return <SettingsCenterPage>{children}</SettingsCenterPage>;
}
