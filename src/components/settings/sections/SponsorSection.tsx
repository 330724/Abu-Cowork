import { Heart } from 'lucide-react';
import sponsorQr from '@/assets/sponsor-qr.png';
import { useI18n } from '@/i18n';

export default function SponsorSection() {
  const { t } = useI18n();

  return (
    <div className="flex flex-col items-center text-center space-y-6 py-8">
      <div className="h-12 w-12 rounded-2xl bg-[#d97757]/10 flex items-center justify-center">
        <Heart className="h-6 w-6 text-[#d97757]" />
      </div>
      <div className="space-y-2">
        <h3 className="text-lg font-semibold text-[#29261b]">{t.about.sponsor}</h3>
        <p className="text-sm text-[#656358]">{t.about.sponsorDesc}</p>
      </div>
      <img src={sponsorQr} alt="Sponsor QR" className="w-52 h-52 rounded-xl shadow-sm" />
    </div>
  );
}
