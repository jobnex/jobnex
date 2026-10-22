import { Check } from "lucide-react";

export function PricingComparison() {
  return (
    <section
      id="compare"
      aria-labelledby="cmp-h"
      className="max-w-[840px] mx-auto px-4 sm:px-6 pt-5 pb-8 sm:pb-10"
    >
      <h2
        id="cmp-h"
        className="m-0 mb-4 font-heading text-lg sm:text-xl tracking-tight font-bold text-[#f3f4f6]"
      >
        Compare plans
      </h2>

      <div className="overflow-x-auto border border-[#262a33] rounded-xl sm:rounded-2xl bg-[#14161b]">
        <table className="w-full min-w-[500px] border-collapse text-xs sm:text-sm">
          <thead>
            <tr>
              <th
                scope="col"
                className="text-left py-3.5 px-4 font-medium text-[#a3a9b4] bg-[#14161b]"
              >
                Feature
              </th>
              <th
                scope="col"
                className="text-center py-3.5 px-4 font-bold text-[#aeee5e] bg-[#aeee5e]/15 border-b-2 border-[#aeee5e] w-[28%]"
              >
                Pro · $129
              </th>
              <th
                scope="col"
                className="text-center py-3.5 px-4 font-semibold text-[#f3f4f6] bg-[#14161b] w-[28%]"
              >
                Starter · $99
              </th>
            </tr>
          </thead>
          <tbody>
            {/* Row 1: Price per resume */}
            <tr className="border-t border-[#262a33]">
              <th scope="row" className="text-left py-3 px-4 font-medium text-[#f3f4f6]">
                Price per resume
              </th>
              <td className="text-center py-3 px-4 bg-[#aeee5e]/10 text-[#aeee5e] font-extrabold text-base sm:text-lg">
                $0.43
              </td>
              <td className="text-center py-3 px-4 text-[#d4d8de]">$0.50</td>
            </tr>

            {/* Row 2: Tailored resumes */}
            <tr className="border-t border-[#262a33]">
              <th scope="row" className="text-left py-3 px-4 font-medium text-[#f3f4f6]">
                Tailored resumes
              </th>
              <td className="text-center py-3 px-4 bg-[#aeee5e]/10 font-bold text-[#f3f4f6]">
                300
              </td>
              <td className="text-center py-3 px-4 text-[#d4d8de]">200</td>
            </tr>

            {/* Row 3: Unlimited job search */}
            <tr className="border-t border-[#262a33]">
              <th scope="row" className="text-left py-3 px-4 font-medium text-[#f3f4f6]">
                Unlimited job search
              </th>
              <td className="text-center py-3 px-4 bg-[#aeee5e]/10">
                <Check className="w-4 h-4 mx-auto text-[#aeee5e]" strokeWidth={2.4} aria-label="Included in Pro" />
              </td>
              <td className="text-center py-3 px-4">
                <Check className="w-4 h-4 mx-auto text-[#aeee5e]" strokeWidth={2.4} aria-label="Included in Starter" />
              </td>
            </tr>

            {/* Row 4: Personalized job recommendations */}
            <tr className="border-t border-[#262a33]">
              <th scope="row" className="text-left py-3 px-4 font-medium text-[#f3f4f6]">
                Personalized job recommendations
              </th>
              <td className="text-center py-3 px-4 bg-[#aeee5e]/10">
                <Check className="w-4 h-4 mx-auto text-[#aeee5e]" strokeWidth={2.4} aria-label="Included in Pro" />
              </td>
              <td className="text-center py-3 px-4">
                <Check className="w-4 h-4 mx-auto text-[#aeee5e]" strokeWidth={2.4} aria-label="Included in Starter" />
              </td>
            </tr>

            {/* Row 5: Application tracking */}
            <tr className="border-t border-[#262a33]">
              <th scope="row" className="text-left py-3 px-4 font-medium text-[#f3f4f6]">
                Application tracking
              </th>
              <td className="text-center py-3 px-4 bg-[#aeee5e]/10">
                <Check className="w-4 h-4 mx-auto text-[#aeee5e]" strokeWidth={2.4} aria-label="Included in Pro" />
              </td>
              <td className="text-center py-3 px-4">
                <Check className="w-4 h-4 mx-auto text-[#aeee5e]" strokeWidth={2.4} aria-label="Included in Starter" />
              </td>
            </tr>

            {/* Row 6: Total price */}
            <tr className="border-t border-[#262a33]">
              <th scope="row" className="text-left py-3 px-4 font-medium text-[#f3f4f6]">
                Total price
              </th>
              <td className="text-center py-3 px-4 bg-[#aeee5e]/10 font-bold text-[#f3f4f6]">
                <span className="font-normal text-[#a3a9b4] text-xs mr-1.5">
                  $<span className="line-through">149</span>
                </span>
                $129
              </td>
              <td className="text-center py-3 px-4 text-[#d4d8de] font-semibold">$99</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}
