import Drawer from '../../components/ui/Drawer';
import Button from '../../components/ui/Button';
import { Field, Select } from '../../components/ui/Fields';

export interface FilterState {
  musteri: string;
  status: string;
  tasima: string;
  hat: string;
  sorumlu: string;
}

interface FilterDrawerProps {
  open: boolean;
  onClose: () => void;
  filters: FilterState;
  onChange: (filters: FilterState) => void;
  onApply: () => void;
  onClear: () => void;
}

export const EMPTY_FILTERS: FilterState = {
  musteri: '',
  status: '',
  tasima: '',
  hat: '',
  sorumlu: '',
};

export default function FilterDrawer({
  open,
  onClose,
  filters,
  onChange,
  onApply,
  onClear,
}: FilterDrawerProps) {
  function set(key: keyof FilterState, value: string) {
    onChange({ ...filters, [key]: value });
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Filtreler"
      subtitle="Tabloyu daraltmak için filtre seçin"
      footer={
        <>
          <Button onClick={onClear}>Temizle</Button>
          <Button variant="primary" onClick={onApply}>Uygula</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Müşteri" htmlFor="f-musteri">
          <Select
            id="f-musteri"
            value={filters.musteri}
            onChange={(e) => set('musteri', e.target.value)}
          >
            <option value="">Tümü</option>
            <option>Arçelik A.Ş.</option>
            <option>BSH Ev Aletleri</option>
            <option>Ford Otosan</option>
            <option>Vestel Ticaret</option>
            <option>Şişecam</option>
            <option>Eczacıbaşı</option>
            <option>Tofaş Türk</option>
            <option>Aygaz</option>
            <option>Kordsa</option>
            <option>Brisa</option>
          </Select>
        </Field>

        <Field label="Statü" htmlFor="f-status">
          <Select
            id="f-status"
            value={filters.status}
            onChange={(e) => set('status', e.target.value)}
          >
            <option value="">Tümü</option>
            <option value="yeni-talep">Yeni Talep</option>
            <option value="gtip-hazirlik">GTİP Hazırlıkta</option>
            <option value="evrak-bekleniyor">Evrak Bekleniyor</option>
            <option value="beyanname-yazim">Beyanname Yazımda</option>
            <option value="ic-kontrol">İç Kontrolde</option>
            <option value="tescil">Tescilde</option>
            <option value="kapanis-bekleyen">Kapanış Bekleyen</option>
            <option value="kapandi">Kapandı</option>
          </Select>
        </Field>

        <Field label="Taşıma Şekli" htmlFor="f-tasima">
          <Select
            id="f-tasima"
            value={filters.tasima}
            onChange={(e) => set('tasima', e.target.value)}
          >
            <option value="">Tümü</option>
            <option value="karayolu">Karayolu</option>
            <option value="denizyolu">Denizyolu</option>
            <option value="havayolu">Havayolu</option>
          </Select>
        </Field>

        <Field label="Hat Durumu" htmlFor="f-hat">
          <Select
            id="f-hat"
            value={filters.hat}
            onChange={(e) => set('hat', e.target.value)}
          >
            <option value="">Tümü</option>
            <option value="kirmizi">Kırmızı</option>
            <option value="sari">Sarı</option>
            <option value="mavi">Mavi</option>
            <option value="yesil">Yeşil</option>
          </Select>
        </Field>

        <Field label="Sorumlu" htmlFor="f-sorumlu">
          <Select
            id="f-sorumlu"
            value={filters.sorumlu}
            onChange={(e) => set('sorumlu', e.target.value)}
          >
            <option value="">Tümü</option>
            <option value="M. Demir">M. Demir</option>
            <option value="S. Kaya">S. Kaya</option>
            <option value="A. Yılmaz">A. Yılmaz</option>
          </Select>
        </Field>
      </div>
    </Drawer>
  );
}
