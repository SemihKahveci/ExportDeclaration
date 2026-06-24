import { useEffect, useState, useMemo } from 'react';
import { Plus, Search, Pencil, Trash2, Loader2, X, AlertTriangle, Copy } from 'lucide-react';
import type { MailTemplate } from '../../types';
import { mailTemplatesService, MAIL_PROCESS_OPTIONS, MAIL_VARIABLES } from '../../services/mails';
import StatCard from '../../components/ui/StatCard';
import { Card, CardHead, CardBody } from '../../components/ui/Card';
import Pill from '../../components/ui/Pill';
import Button from '../../components/ui/Button';
import { Table, Th, Td, Tr } from '../../components/ui/Table';
import Drawer from '../../components/ui/Drawer';
import { Field, Input, Select, Textarea } from '../../components/ui/Fields';
import { useToast } from '../../components/ui/Toast';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PROCESS_LABEL: Record<string, string> = Object.fromEntries(
  MAIL_PROCESS_OPTIONS.map((o) => [o.value, o.label])
);

function VariablePills({ vars }: { vars: string[] }) {
  if (vars.length === 0) return <span className="text-muted-2 text-[12px]">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {vars.map((v) => (
        <span
          key={v}
          className="inline-block px-2 py-0.5 rounded-full bg-surface-2 border border-line text-[11px] font-mono text-text"
        >
          {v}
        </span>
      ))}
    </div>
  );
}

// ─── Template Drawer ──────────────────────────────────────────────────────────

interface TemplateDrawerProps {
  mode: 'new' | 'edit' | 'delete';
  template: MailTemplate | null;
  onSave: (t: MailTemplate) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

function TemplateDrawer({ mode, template, onSave, onDelete, onClose }: TemplateDrawerProps) {
  const [name,       setName]       = useState('');
  const [process,    setProcess]    = useState(MAIL_PROCESS_OPTIONS[0].value);
  const [subject,    setSubject]    = useState('');
  const [body,       setBody]       = useState('');
  const [active,     setActive]     = useState(true);
  const [bodyRef,    setBodyRef]    = useState<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (mode === 'edit' && template) {
      setName(template.name);
      setProcess(template.processStep);
      setSubject(template.subject);
      setBody(template.body);
      setActive(template.active);
    } else if (mode === 'new') {
      setName('');
      setProcess(MAIL_PROCESS_OPTIONS[0].value);
      setSubject('');
      setBody('');
      setActive(true);
    }
  }, [mode, template]);

  function handleSave() {
    const usedVars = MAIL_VARIABLES.filter(
      (v) => body.includes(v) || subject.includes(v)
    );
    onSave({
      id: template?.id ?? `mail-${Date.now()}`,
      name,
      processStep: process,
      subject,
      body,
      variables: usedVars,
      active,
    });
  }

  function insertVariable(v: string) {
    if (!bodyRef) return;
    const start = bodyRef.selectionStart ?? body.length;
    const end   = bodyRef.selectionEnd   ?? body.length;
    const next  = body.slice(0, start) + v + body.slice(end);
    setBody(next);
    // Restore cursor after insertion
    requestAnimationFrame(() => {
      bodyRef.focus();
      bodyRef.setSelectionRange(start + v.length, start + v.length);
    });
  }

  const isDelete = mode === 'delete';

  return (
    <Drawer
      open
      onClose={onClose}
      title={isDelete ? 'Şablonu Sil' : mode === 'new' ? 'Yeni Mail Şablonu' : 'Şablon Düzenle'}
      subtitle={
        isDelete
          ? `"${template?.name}" şablonunu silmek istediğinize emin misiniz?`
          : 'Mail şablonunu tanımlayın veya düzenleyin.'
      }
      footer={
        isDelete ? (
          <>
            <Button onClick={onClose}>Vazgeç</Button>
            <Button
              variant="danger"
              icon={Trash2}
              onClick={() => template && onDelete(template.id)}
            >
              Evet, Sil
            </Button>
          </>
        ) : (
          <>
            <Button onClick={onClose}>Vazgeç</Button>
            <Button variant="primary" onClick={handleSave} disabled={!name.trim() || !subject.trim()}>
              Kaydet
            </Button>
          </>
        )
      }
    >
      {isDelete ? (
        <div className="flex items-start gap-3 p-4 rounded-xl border text-[13px]" style={{ background: 'var(--warn-tint)', borderColor: '#e8d0a2', color: '#7a5a16' }}>
          <AlertTriangle size={16} strokeWidth={1.75} className="shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Bu işlem geri alınamaz.</p>
            <p className="mt-1 leading-snug">
              <strong>{template?.name}</strong> şablonu kalıcı olarak silinecek.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <Field label="Şablon Adı" htmlFor="mt-name" required>
            <Input
              id="mt-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Örn. Eksik Evrak Hatırlatma"
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Süreç" htmlFor="mt-process">
              <Select
                id="mt-process"
                value={process}
                onChange={(e) => setProcess(e.target.value)}
              >
                {MAIL_PROCESS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </Select>
            </Field>
            <Field label="Durum" htmlFor="mt-status">
              <Select
                id="mt-status"
                value={active ? 'aktif' : 'pasif'}
                onChange={(e) => setActive(e.target.value === 'aktif')}
              >
                <option value="aktif">Aktif</option>
                <option value="pasif">Pasif</option>
              </Select>
            </Field>
          </div>

          <Field label="Mail Konusu" htmlFor="mt-subject" required>
            <Input
              id="mt-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Örn. [{referans}] Eksik Evrak Bildirimi"
            />
          </Field>

          <Field label="Mail İçeriği" htmlFor="mt-body">
            <Textarea
              id="mt-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              ref={(el) => setBodyRef(el)}
              rows={9}
              placeholder="Mail içeriğini buraya yazın. Değişken eklemek için aşağıdaki düğmeleri kullanın."
            />
          </Field>

          <div>
            <p className="text-[12px] font-medium text-text-strong mb-2">Kullanılabilir Değişkenler</p>
            <p className="text-[11.5px] text-muted mb-2">Tıklayarak konu veya içeriğe ekleyin.</p>
            <div className="flex flex-wrap gap-1.5">
              {MAIL_VARIABLES.map((v) => {
                const used = body.includes(v) || subject.includes(v);
                return (
                  <button
                    key={v}
                    type="button"
                    onClick={() => insertVariable(v)}
                    className={[
                      'inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-[11.5px] font-mono transition-colors',
                      used
                        ? 'bg-accent/10 border-accent/30 text-accent'
                        : 'bg-surface-2 border-line text-muted hover:border-accent/40 hover:text-text hover:bg-surface',
                    ].join(' ')}
                    title="İçeriğe ekle"
                  >
                    <Copy size={10} strokeWidth={2} />
                    {v}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </Drawer>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type DrawerMode = 'new' | 'edit' | 'delete' | null;

export default function MaillerPage() {
  const { toast } = useToast();

  const [loading,   setLoading]   = useState(true);
  const [templates, setTemplates] = useState<MailTemplate[]>([]);

  // Filters
  const [search,        setSearch]        = useState('');
  const [filterProcess, setFilterProcess] = useState('');
  const [filterStatus,  setFilterStatus]  = useState('');

  // Drawer
  const [drawerMode,     setDrawerMode]     = useState<DrawerMode>(null);
  const [drawerTemplate, setDrawerTemplate] = useState<MailTemplate | null>(null);

  useEffect(() => {
    mailTemplatesService.list().then((list) => {
      setTemplates(list);
      setLoading(false);
    });
  }, []);

  // ── Derived stats ────────────────────────────────────────────────────────

  const stats = useMemo(() => {
    const total   = templates.length;
    const active  = templates.filter((t) => t.active).length;
    const passive = total - active;
    const procs   = new Set(templates.map((t) => t.processStep)).size;
    return { total, active, passive, procs };
  }, [templates]);

  // ── Filtered list ────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    return templates.filter((t) => {
      if (search        && !t.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (filterProcess && t.processStep !== filterProcess)                      return false;
      if (filterStatus === 'Aktif'  && !t.active)                                return false;
      if (filterStatus === 'Pasif'  &&  t.active)                                return false;
      return true;
    });
  }, [templates, search, filterProcess, filterStatus]);

  const hasFilters = search !== '' || filterProcess !== '' || filterStatus !== '';

  function clearFilters() {
    setSearch('');
    setFilterProcess('');
    setFilterStatus('');
  }

  // ── Drawer handlers ──────────────────────────────────────────────────────

  function openNew() {
    setDrawerTemplate(null);
    setDrawerMode('new');
  }

  function openEdit(t: MailTemplate) {
    setDrawerTemplate(t);
    setDrawerMode('edit');
  }

  function openDelete(t: MailTemplate, e: React.MouseEvent) {
    e.stopPropagation();
    setDrawerTemplate(t);
    setDrawerMode('delete');
  }

  function closeDrawer() {
    setDrawerMode(null);
    setDrawerTemplate(null);
  }

  async function handleSave(t: MailTemplate) {
    const isNew = !templates.find((x) => x.id === t.id);
    await mailTemplatesService.save(t);
    setTemplates((prev) =>
      isNew ? [t, ...prev] : prev.map((x) => (x.id === t.id ? t : x))
    );
    closeDrawer();
    toast('Mail şablonu kaydedildi');
  }

  async function handleDelete(id: string) {
    await mailTemplatesService.delete(id);
    setTemplates((prev) => prev.filter((x) => x.id !== id));
    closeDrawer();
    toast('Mail şablonu silindi');
  }

  return (
    <div className="px-7 pt-6 pb-12 overflow-y-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h1 className="text-[23px] font-extrabold text-text-strong tracking-tight">Mailler</h1>
          <p className="text-[12.5px] text-muted mt-1">
            Sistemin göndereceği mail şablonlarını süreç bazında tanımlayın ve düzenleyin.
          </p>
        </div>
        <Button variant="primary" icon={Plus} onClick={openNew}>
          Yeni Mail Şablonu
        </Button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        <div className="relative overflow-hidden">
          <StatCard value={stats.total}   label="Toplam Şablon" />
          <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-accent rounded-l" />
        </div>
        <div className="relative overflow-hidden">
          <StatCard value={stats.active}  label="Aktif Şablon" />
          <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-ok rounded-l" />
        </div>
        <div className="relative overflow-hidden">
          <StatCard value={stats.passive} label="Pasif Şablon" />
          <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l" style={{ background: 'var(--muted-2)' }} />
        </div>
        <div className="relative overflow-hidden">
          <StatCard value={stats.procs}   label="Kullanılan Süreç" />
          <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l" style={{ background: 'var(--hat-blue)' }} />
        </div>
      </div>

      {/* Main card */}
      <Card>
        <CardHead
          title="Şablon Listesi"
          sub="Süreç bazlı sistem mail şablonları"
          actions={
            <div className="flex items-center gap-2 flex-wrap">
              {/* Search */}
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-2 pointer-events-none" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Şablon ara…"
                  className="pl-8 pr-3 h-8 border border-line-strong rounded-[7px] text-[12.5px] text-text bg-surface focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-tint w-44"
                />
              </div>

              {/* Process filter */}
              <select
                value={filterProcess}
                onChange={(e) => setFilterProcess(e.target.value)}
                className="h-8 border border-line-strong rounded-[7px] px-2.5 text-[12.5px] text-text bg-surface font-[inherit] focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-tint"
              >
                <option value="">Süreç (Tümü)</option>
                {MAIL_PROCESS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>

              {/* Status filter */}
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="h-8 border border-line-strong rounded-[7px] px-2.5 text-[12.5px] text-text bg-surface font-[inherit] focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-tint"
              >
                <option value="">Durum (Tümü)</option>
                <option value="Aktif">Aktif</option>
                <option value="Pasif">Pasif</option>
              </select>

              {hasFilters && (
                <Button size="sm" icon={X} onClick={clearFilters}>
                  Temizle
                </Button>
              )}
            </div>
          }
        />

        <CardBody className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-16 gap-3 text-muted">
              <Loader2 size={20} className="animate-spin" />
              <span className="text-[13px]">Yükleniyor…</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-[13px] text-muted">
              {hasFilters
                ? 'Filtreyle eşleşen şablon bulunamadı.'
                : 'Henüz mail şablonu tanımlanmadı.'}
            </div>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Şablon Adı</Th>
                  <Th>Süreç</Th>
                  <Th>Konu</Th>
                  <Th>Kullanılan Değişkenler</Th>
                  <Th>Durum</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => (
                  <Tr
                    key={t.id}
                    className={t.active ? '' : 'opacity-60'}
                    onClick={() => openEdit(t)}
                  >
                    <Td>
                      <span className="font-semibold text-[13px] text-text-strong">{t.name}</span>
                    </Td>
                    <Td>
                      <span className="inline-block px-2.5 py-0.5 rounded-full bg-accent-tint border border-accent/20 text-accent text-[11.5px] font-medium">
                        {PROCESS_LABEL[t.processStep] ?? t.processStep}
                      </span>
                    </Td>
                    <Td>
                      <span className="text-[12.5px] text-muted max-w-[220px] block truncate" title={t.subject}>
                        {t.subject}
                      </span>
                    </Td>
                    <Td>
                      <VariablePills vars={t.variables} />
                    </Td>
                    <Td>
                      <Pill variant={t.active ? 'ok' : 'gray'}>
                        {t.active ? 'Aktif' : 'Pasif'}
                      </Pill>
                    </Td>
                    <Td>
                      <div
                        className="flex items-center gap-1.5 justify-end"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Button size="sm" icon={Pencil} onClick={() => openEdit(t)}>
                          Düzenle
                        </Button>
                        <Button size="sm" icon={Trash2} onClick={(e) => openDelete(t, e)} />
                      </div>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </CardBody>
      </Card>

      {drawerMode && (
        <TemplateDrawer
          mode={drawerMode}
          template={drawerTemplate}
          onSave={handleSave}
          onDelete={handleDelete}
          onClose={closeDrawer}
        />
      )}
    </div>
  );
}
