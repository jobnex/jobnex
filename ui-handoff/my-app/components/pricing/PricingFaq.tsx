"use client";

import { useState } from "react";
import { Plus } from "lucide-react";

interface FaqItem {
  question: string;
  answer: string;
}

const FAQS: FaqItem[] = [
  {
    question: "What counts as one resume?",
    answer:
      "One resume tailored specifically to one target job posting. Job searching, tailored recommendations, and application status tracking never consume your credits — they are always 100% unlimited across all plans.",
  },
  {
    question: "Can I switch plans later?",
    answer:
      "Yes — you can upgrade or adjust your plan anytime directly from 'Manage plans' in your profile menu. Any remaining resumes rollover seamlessly and your new balance becomes immediately available.",
  },
  {
    question: "What if I don't use all my resumes?",
    answer:
      "Your purchased resumes never expire. Whether you apply steadily over weeks or in bursts across several months, your credits remain safely in your wallet until you're ready to use them.",
  },
  {
    question: "How do I cancel?",
    answer:
      "Directly from your profile dropdown under 'Manage plans', in just two clicks. No phone calls, no hidden cancellation hoops, and backed by our full 7-day money-back guarantee.",
  },
];

export function PricingFaq() {
  const [openIndices, setOpenIndices] = useState<number[]>([0]);

  const toggle = (index: number) => {
    setOpenIndices((prev) =>
      prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index]
    );
  };

  return (
    <section
      id="faq"
      aria-labelledby="faq-h"
      className="max-w-[760px] mx-auto px-4 sm:px-6 pb-10 sm:pb-12"
    >
      <h2
        id="faq-h"
        className="m-0 mb-3.5 font-heading text-lg sm:text-xl tracking-tight font-bold text-[#f3f4f6]"
      >
        Questions, answered
      </h2>

      <div className="flex flex-col border-t border-[#262a33]">
        {FAQS.map((faq, idx) => {
          const isOpen = openIndices.includes(idx);
          return (
            <div key={idx} className="border-b border-[#262a33]">
              <button
                type="button"
                onClick={() => toggle(idx)}
                aria-expanded={isOpen}
                className="w-full flex justify-between items-center gap-4 py-3.5 px-1 text-left cursor-pointer group focus:outline-none"
              >
                <span className="font-heading text-sm sm:text-[15px] font-medium text-[#f3f4f6] group-hover:text-[#aeee5e] transition-colors">
                  {faq.question}
                </span>
                <span
                  aria-hidden="true"
                  className={`text-[#aeee5e] shrink-0 transition-transform duration-200 ${
                    isOpen ? "rotate-45" : "rotate-0"
                  }`}
                >
                  <Plus className="w-4 h-4" strokeWidth={2.5} />
                </span>
              </button>

              <div
                className={`overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                  isOpen ? "max-h-96 opacity-100 pb-3.5" : "max-h-0 opacity-0 pb-0"
                }`}
              >
                <p className="m-0 px-1 text-xs sm:text-sm leading-relaxed text-[#a3a9b4]">
                  {faq.answer}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
