// Original layout identities, shared readable spacing and editable source metadata.
#let theme = int(sys.inputs.at("theme", default: "2"))
#let serif = theme == 5
#let body-size = 10pt
#set page(paper: "us-letter", margin: (x: if theme == 6 { 34pt } else { 36pt }, top: 30pt, bottom: 30pt))
#set text(font: if serif { "Times New Roman" } else { "Arial" }, size: body-size, lang: "en", fill: black)
#set par(leading: 0.35em, spacing: 0.45em, justify: false)
#set heading(numbering: none)
#set list(indent: 0pt, body-indent: 12pt, tight: false, spacing: 4pt)
#set enum(indent: 0pt, body-indent: 14pt, tight: false, spacing: 4pt)

#show heading.where(level: 1): it => block(width: 100%, above: 0pt, below: 4pt)[
  #align(if theme == 5 or theme == 6 { left } else { center })[
    #text(size: if theme == 3 { 20pt } else if theme == 6 { 21pt } else { 19pt },
      weight: if theme == 3 or theme == 6 { "regular" } else { "bold" },
      fill: if theme == 3 { rgb("111111") } else { black }, it.body)
  ]
]
#show heading.where(level: 2): it => block(width: 100%, sticky: true, above: 7pt, below: 3pt,
  inset: (bottom: if theme == 6 { 0pt } else { 2pt }),
  stroke: if theme == 6 { none } else { (bottom: (thickness: if theme == 2 { 0.6pt } else { 0.5pt }, paint: if theme == 3 { rgb("aaaaaa") } else { black })) })[
  #if theme == 6 {
    block(stroke: (left: 3.5pt + black), inset: (left: 7pt))[
      #text(size: 10.5pt, weight: "bold", tracking: 0.5pt, upper(it.body))
    ]
  } else {
    text(size: if theme == 3 { 10pt } else { 10.5pt }, weight: "bold", top-edge: 0.8em, bottom-edge: -0.2em,
      fill: if theme == 3 { rgb("666666") } else { black },
      tracking: if theme == 3 { 1.2pt } else if theme == 5 { 0.4pt } else { 0pt },
      if theme == 2 { it.body } else { upper(it.body) })
  }
]
#show heading.where(level: 3): it => block(sticky: true, above: 9pt, below: 3pt)[#text(weight: "bold", it.body)]
#show heading.where(level: 4): it => block(sticky: true, above: 4pt, below: 2pt)[#text(weight: "bold", it.body)]
#show link: it => text(fill: if theme == 3 { rgb("555555") } else { black }, it)

#let resume-contacts(..items) = {
  set text(size: 9pt, fill: if theme == 3 or theme == 6 { rgb("444444") } else { black })
  set par(leading: 0.35em, spacing: 2.5pt)
  if theme == 5 {
    align(right)[#for item in items.pos() { block(width: 100%, below: 2.5pt)[#item] }]
  } else {
    align(if theme == 6 { left } else { center })[
      #layout(size => {
        let fields = items.pos().map(item => if measure(item).width <= size.width { box(item) } else { block(width: 100%)[#item] })
        fields.join(h(8pt))
      })
    ]
  }
}
#let resume-header(name: [], contacts: []) = block(width: 100%, below: 6pt)[
  #if theme == 5 {
    grid(columns: (1fr, 1fr), column-gutter: 12pt, name, contacts)
    v(4pt)
    line(length: 100%, stroke: 0.5pt)
  } else {
    name
    v(3pt)
    contacts
  }
]
#let resume-entry(left: [], dates: []) = block(width: 100%, sticky: true, below: 4pt)[
  #grid(columns: (2fr, 1fr), column-gutter: 10pt, left, align(right)[#text(size: 9pt, dates)])
]

#let mark(id, edge, width) = context [#metadata((id: id, edge: edge, width: width, position: here().position())) <resume-source>]
#let tracked(id, body, width: if theme == 6 { 544pt } else { 540pt }) = [#mark(id, "start", width)#body#mark(id, "end", width)]
