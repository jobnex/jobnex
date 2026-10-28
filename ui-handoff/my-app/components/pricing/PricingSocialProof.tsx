export function PricingSocialProof() {
  const testimonials = [
    {
      quote:
        "“Landing interviews used to take weeks of tedious rewrites. With Jobnex, I tailored 40 resumes in one afternoon and secured 6 callbacks in my first two weeks.”",
      name: "Marcus V.",
      role: "Senior Frontend Engineer",
      plan: "Pro",
    },
    {
      quote:
        "“The cost per resume is negligible compared to landing an offer months faster. The precision keywords and ATS tailoring made an immediate, noticeable impact.”",
      name: "Elena R.",
      role: "Product Designer",
      plan: "Pro",
    },
  ];

  return (
    <section
      aria-label="What job seekers say"
      className="max-w-[840px] mx-auto px-4 sm:px-6 pb-8 sm:pb-10"
    >
      <div className="flex flex-col md:flex-row gap-4">
        {testimonials.map((t, i) => (
          <figure
            key={i}
            className="flex-1 min-w-0 m-0 bg-[#14161b] border border-[#262a33] rounded-xl sm:rounded-2xl p-5 sm:p-6 flex flex-col gap-3"
          >
            <blockquote className="m-0 text-sm sm:text-[15px] leading-relaxed text-[#f3f4f6]">
              {t.quote}
            </blockquote>
            <figcaption className="text-xs text-[#a3a9b4]">
              <span className="font-semibold text-[#d4d8de]">{t.name}</span> · {t.role} ·{" "}
              <span className="text-[#aeee5e] font-semibold">{t.plan}</span>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
