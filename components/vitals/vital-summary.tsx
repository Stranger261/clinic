type Vitals = {
  systolic: number | null;
  diastolic: number | null;
  pulse: number | null;
  temperature_c: number | null;
  resp_rate: number | null;
  spo2: number | null;
  weight_kg: number | null;
  height_cm: number | null;
  bmi: number | null;
  pain_score: number | null;
};

export default function VitalsSummary({ v }: { v: Vitals }) {
  const items: [string, string][] = [
    ["Blood pressure", `${v.systolic}/${v.diastolic} mmHg`],
    ["Pulse", `${v.pulse} per min`],
    ["Temperature", `${Number(v.temperature_c)} °C`],
    ["Breathing", `${v.resp_rate} per min`],
    ["Oxygen", `${v.spo2}%`],
    ["Weight", `${Number(v.weight_kg)} kg`],
    ["Height", `${Number(v.height_cm)} cm`],
    ["BMI", `${Number(v.bmi)}`],
    ["Pain", `${v.pain_score} / 10`],
  ];
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl bg-canvas p-3 text-sm sm:grid-cols-3 lg:grid-cols-5">
      {items.map(([label, value]) => (
        <div key={label}>
          <dt className="text-xs text-muted">{label}</dt>
          <dd className="font-medium">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
