import fs from "node:fs";
import path from "node:path";

export type IdpSkillMetadata = {
  name: string;
  description: string;
  version: string;
  capabilities: string[];
};

export type LoadedIdpSkill = {
  metadata: IdpSkillMetadata;
  directory: string;
  skillPath: string;
  instructions: string;
  references: Array<{ name: string; path: string; content: string }>;
};

export const DEFAULT_IDP_SKILLS_ROOT = path.resolve(process.cwd(), "backend", "idp-skills");

function parseList(value: string): string[] {
  const trimmed = value.trim();
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) return [];
  return trimmed.slice(1, -1).split(",").map(v => v.trim()).filter(Boolean);
}

function parseSkillDocument(raw: string): { metadata: IdpSkillMetadata; instructions: string } {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) throw new Error("SKILL.md must start with YAML-style frontmatter bounded by ---");
  const values = new Map<string, string>();
  for (const line of match[1].split(/\r?\n/)) {
    const colon = line.indexOf(":");
    if (colon <= 0) continue;
    values.set(line.slice(0, colon).trim(), line.slice(colon + 1).trim());
  }
  const name = values.get("name") ?? "";
  const description = values.get("description") ?? "";
  const version = values.get("version") ?? "";
  const capabilities = parseList(values.get("capabilities") ?? "[]");
  if (!name || !description || !version || capabilities.length === 0) {
    throw new Error("SKILL.md frontmatter requires name, description, version and non-empty capabilities");
  }
  return { metadata: { name, description, version, capabilities }, instructions: match[2].trim() };
}

export function listIdpSkillNames(root = DEFAULT_IDP_SKILLS_ROOT): string[] {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && fs.existsSync(path.join(root, entry.name, "SKILL.md")))
    .map(entry => entry.name)
    .sort();
}

export function loadIdpSkill(name: string, root = DEFAULT_IDP_SKILLS_ROOT): LoadedIdpSkill {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) throw new Error(`Invalid IDP skill name: ${name}`);
  const directory = path.join(root, name);
  const skillPath = path.join(directory, "SKILL.md");
  if (!fs.existsSync(skillPath)) throw new Error(`Unknown IDP skill: ${name}`);
  const parsed = parseSkillDocument(fs.readFileSync(skillPath, "utf8"));
  if (parsed.metadata.name !== name) throw new Error(`Skill directory/name mismatch: ${name} != ${parsed.metadata.name}`);
  const referencesDir = path.join(directory, "references");
  const references = fs.existsSync(referencesDir)
    ? fs.readdirSync(referencesDir, { withFileTypes: true })
        .filter(entry => entry.isFile() && entry.name.endsWith(".md"))
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(entry => ({ name: entry.name, path: path.join(referencesDir, entry.name), content: fs.readFileSync(path.join(referencesDir, entry.name), "utf8").trim() }))
    : [];
  return { ...parsed, directory, skillPath, references };
}

export function loadIdpSkills(names: string[], root = DEFAULT_IDP_SKILLS_ROOT): LoadedIdpSkill[] {
  return [...new Set(names)].map(name => loadIdpSkill(name, root));
}

export function renderIdpSkillContext(skill: LoadedIdpSkill): string {
  const refs = skill.references.length
    ? `\n\n# References\n${skill.references.map(ref => `\n## ${ref.name}\n${ref.content}`).join("\n")}`
    : "";
  return `# Skill: ${skill.metadata.name}\nVersion: ${skill.metadata.version}\n\n${skill.instructions}${refs}`;
}
