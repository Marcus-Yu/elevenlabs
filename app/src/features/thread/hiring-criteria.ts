import { HireCriteria } from '../matches/candidates';

export const roboticsDemoCriteria = {
  role: 'Robotics engineer',
  titles: 'robotics engineer, robotics software engineer',
  skills: 'ROS, C++',
  preferredSkills: 'Python, motion planning, computer vision, SLAM',
  minimum: '2',
  countries: 'USA',
};

function commaSeparated(value: string): string[] {
  return value.split(',').map((entry) => entry.trim()).filter(Boolean);
}

export function parseHiringCriteria(
  form: typeof roboticsDemoCriteria,
  evidence: { criterion: string; reactions: string[] }[],
) {
  const role = form.role.trim();
  const titles = commaSeparated(form.titles);
  const countries = commaSeparated(form.countries).map((code) => code.toUpperCase());
  return HireCriteria.safeParse({
    role,
    titles: titles.length ? titles : [role],
    mustHaveSkills: commaSeparated(form.skills),
    niceToHaveSkills: commaSeparated(form.preferredSkills),
    ...(form.minimum === '' ? {} : { minYearsExperience: Number(form.minimum) }),
    ...(countries.length ? { countryCodes: countries } : {}),
    evidence,
  });
}
