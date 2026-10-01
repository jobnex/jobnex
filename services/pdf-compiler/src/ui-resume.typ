// Mirrors ResumeSheet. Text comes from JSON values, never evaluated Typst source.
#let data = json("ui-resume.json")
#let theme = int(sys.inputs.at("theme", default: "2"))
#let serif = theme == 5
#let font-size = if serif { 8.6pt } else if theme == 6 { 8.8pt } else { 8.5pt }
#set page(paper: "us-letter", margin: (x: if theme == 6 { 1.1cm } else { 1cm }, y: 0.8cm))
#set text(font: if serif { "Times New Roman" } else { "Arial" }, size: font-size, fill: black,
  top-edge: 0.95em, bottom-edge: -0.425em)
#set par(leading: 0pt, spacing: 0pt, justify: false)
#set block(above: 0pt, below: 0pt)
#set list(marker: [•], indent: 0pt, body-indent: 1.15em, spacing: 0.12em)
#let info = data.personalInfo
#let contacts = (info.phone, info.email, info.linkedin, info.github, info.location).filter(x => x != "")
#let subtitle(size, color, italic: false) = {
  if info.title != "" {
    v(1.5pt)
    text(size: size, fill: color, style: if italic { "italic" } else { "normal" }, info.title)
    parbreak()
  }
}
#if theme == 5 {
  block(width: 100%, below: 0.4em)[
    #grid(columns: (1fr, 1fr), column-gutter: 8pt,
      [
        #text(size: 19pt, weight: "bold", top-edge: 0.95em, bottom-edge: -0.3em, info.name)
        #parbreak()
        #subtitle(9pt, black, italic: true)
        #if info.linkedin != "" or info.github != "" {
          v(3pt)
          text(size: 8.5pt, (info.linkedin, info.github).filter(x => x != "").join("   "))
        }
      ],
      align(right)[
        #set text(size: 8.5pt)
        #for contact in (info.email, info.phone, info.location).filter(x => x != "") {
          contact
          parbreak()
        }
      ],
    )
    #v(0.35em)
    #line(length: 100%, stroke: 0.5pt)
  ]
} else {
  align(if theme == 6 { left } else { center })[
    #text(size: if theme == 6 { 21pt } else if theme == 3 { 20pt } else { 19pt },
      weight: if theme == 2 { "bold" } else { "regular" }, top-edge: 0.95em, bottom-edge: -0.3em,
      fill: if theme == 3 { rgb("111111") } else { black }, info.name)
    #parbreak()
    #subtitle(9.5pt, if theme == 3 { rgb("555555") } else if theme == 6 { rgb("444444") } else { black }, italic: theme == 2)
    #if contacts.len() > 0 {
      v(3pt)
      text(size: if theme == 6 { 8.8pt } else { 8.5pt },
        fill: if theme == 3 { rgb("555555") } else if theme == 6 { rgb("444444") } else { black },
        contacts.join(if theme == 6 { " • " } else { "  |  " }))
    }
  ]
  v(if theme == 6 { 0.45em } else { 0.4em })
}
#let section(title) = {
  block(sticky: true, above: if theme == 6 { 0.45em } else if theme == 3 { 0.38em } else if theme == 5 { 0.32em } else { 0.35em }, below: 0.25em)[
    #if theme == 6 {
      block(stroke: (left: 3.5pt), inset: (left: 0.5em))[
        #text(size: 10.5pt, weight: "bold", tracking: 0.5pt, top-edge: 0.8em, bottom-edge: -0.2em, upper(title))
      ]
    } else {
      text(size: if theme == 3 { 9.8pt } else { 10pt }, weight: "bold", top-edge: 0.8em, bottom-edge: -0.2em,
        fill: if theme == 3 { rgb("666666") } else { black },
        tracking: if theme == 3 { 1.2pt } else if theme == 5 { 0.4pt } else { 0pt },
        if theme == 2 { title } else { upper(title) })
      parbreak()
      v(0.75pt)
      line(length: 100%, stroke: (thickness: if theme == 2 { 0.6pt } else { 0.5pt }, paint: if theme == 3 { rgb("aaaaaa") } else { black }))
    }
  ]
}
// Fixed fractions let long roles and dates wrap independently rather than collide.
#let entry(left-content, right-content) = block(sticky: true)[
  #grid(columns: (3fr, 1fr), column-gutter: 6pt, left-content, align(right)[#text(size: 8.2pt, right-content)])
]
#let bullets(items) = {
  if items.len() > 0 {
    block(above: 0.12em, below: 0.15em)[#list(..items)]
  }
}
#for sec in data.sectionOrder {
  if sec == "summary" and data.summary.len() > 0 {
    section("Professional Summary")
    bullets(data.summary)
  } else if sec == "skills" and data.skills.len() > 0 {
    section("Technical Skills")
    for skill in data.skills {
      block(above: 0.12em)[#strong(skill.category + ": ")#skill.items]
    }
    v(0.3em)
  } else if sec == "experience" and data.experience.len() > 0 {
    section("Professional Experience")
    for job in data.experience {
      entry([#strong(job.role)#if job.company != "" [ | #emph(job.company)]],
        (job.location, job.duration).filter(x => x != "").join(" | "))
      bullets(job.bullets)
      v(0.35em)
    }
  } else if sec == "projects" and data.projects.len() > 0 {
    section("Technical Projects")
    for project in data.projects {
      entry([#strong(project.title)#if project.technologies != "" [ | #project.technologies]], project.duration)
      bullets(project.bullets)
      v(0.35em)
    }
  } else if sec == "education" and data.education.len() > 0 {
    section("Education")
    for edu in data.education {
      entry(strong(edu.institution), edu.location)
      entry(emph(edu.degree), edu.duration)
      if edu.at("details", default: "") != "" {
        block(above: 1.5pt)[#text(size: 8pt, fill: rgb("222222"), edu.details)]
      }
      v(0.25em)
    }
  }
}
