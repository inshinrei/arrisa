import {describe, expect, it} from "vitest"
import {highlightCode, type CodeSpan} from "./highlight-code"

function slices(text: string, lang?: string) {
    return highlightCode(text, lang).map((s) => ({
        slice: text.slice(s.from, s.to),
        role: s.role,
        emphasis: s.emphasis,
    }))
}

function has(text: string, lang: string | undefined, slice: string, role: string, emphasis?: "bold" | "italic") {
    let hit = slices(text, lang).filter((s) => s.slice == slice && s.role == role)
    expect(hit.length).toBeGreaterThan(0)
    if (emphasis) expect(hit.some((s) => s.emphasis == emphasis)).toBe(true)
    else expect(hit.some((s) => s.emphasis == null)).toBe(true)
}

function plainAt(text: string, lang: string | undefined, token: string) {
    let i = text.indexOf(token)
    expect(i).toBeGreaterThan(-1)
    let spans = highlightCode(text, lang)
    expect(spans.some((s) => s.from <= i && i < s.to)).toBe(false)
}

function assertClean(spans: CodeSpan[]) {
    let prev = 0
    for (let s of spans) {
        expect(s.from).toBeGreaterThanOrEqual(prev)
        expect(s.to).toBeGreaterThan(s.from)
        prev = s.to
    }
}

describe("highlightCode", () => {
    it("returns no spans above the cap", () => {
        expect(highlightCode("a".repeat(32001), "js")).toEqual([])
        expect(highlightCode("\n".repeat(400), "js")).toEqual([])
        let under = highlightCode("// a\n".repeat(399), "js")
        expect(under.length).toBeGreaterThan(0)
    })

    it("spans do not overlap", () => {
        let text = "function getDiscount(user: User) { if (user.isActive === true) return 0.15 }"
        assertClean(highlightCode(text, "ts"))
    })

    it("paints the role samples", () => {
        has("if (x > 0) { return true; }", "js", "if", "kw-flow")
        has("if (x > 0) { return true; }", "js", "return", "kw-flow")
        has("if (x > 0) { return true; }", "js", "true", "constant")
        plainAt("if (x > 0) { return true; }", "js", ">")
        plainAt("if (x > 0) { return true; }", "js", "(")
        has("if x > 0:\nreturn True", "py", "if", "kw-flow")
        has("if x > 0:\nreturn True", "py", "return", "kw-flow")
        has("if x > 0:\nreturn True", "py", "True", "constant")
        has("function calc(a: number) {}", "ts", "function", "kw-decl")
        has("function calc(a: number) {}", "ts", "calc", "function")
        has("function calc(a: number) {}", "ts", "number", "type")
        has("def calc(a):", "py", "def", "kw-decl")
        has("def calc(a):", "py", "calc", "function")
        has("public static void main()", "java", "public", "modifier")
        has("public static void main()", "java", "static", "modifier")
        has("public static void main()", "java", "void", "kw-decl")
        has("public static void main()", "java", "main", "function")
        has("suspend fun load()", "kt", "suspend", "modifier")
        has("suspend fun load()", "kt", "fun", "kw-decl")
        has("suspend fun load()", "kt", "load", "function")
        has('let name: string = "Ann";', "ts", "let", "kw-decl")
        has('let name: string = "Ann";', "ts", "string", "type")
        has('let name: string = "Ann";', "ts", '"Ann"', "string")
        has("let string = 1", "ts", "let", "kw-decl")
        expect(slices("let string = 1", "ts").some((s) => s.slice == "string")).toBe(false)
        has("List<String>", "java", "List", "type")
        has("List<String>", "java", "String", "type")
        plainAt("List<String>", "java", "<")
        has("array.map(fn)", "js", "map", "function")
        expect(slices("array.map(fn)", "js").some((s) => s.slice == "array")).toBe(false)
        has("len(items)", "py", "len", "function")
        has('{ "color": "red" }', "json", '"color"', "property")
        has('{ "color": "red" }', "json", '"red"', "string")
        has("color: red", "yaml", "color", "property")
        has("color: red", "yaml", "red", "string")
        has('greeting = "Hello"', "py", '"Hello"', "string")
        has('let s = "Hello";', "rust", "let", "kw-decl")
        has('let s = "Hello";', "rust", '"Hello"', "string")
        has("`Hello ${name}`", "js", "name", "interpolation")
        has("`Hello ${name}`", "js", "`Hello ${", "string")
        has("`Hello ${name}`", "js", "}`", "string")
        has('"Hello #{name}"', "ruby", "name", "interpolation")
        has('"line1\\nline2"', "js", "\\n", "escape")
        has('"line1\\nline2"', "c", "\\n", "escape")
        has("price = 19.99", "py", "19.99", "number")
        has("let x = 0xFF;", "rust", "0x", "modifier")
        has("let x = 0xFF;", "rust", "FF", "number")
        has("isActive = true", "js", "true", "constant")
        has("is_active = True", "py", "True", "constant")
        has("let x = _", "rust", "_", "constant")
        has("# calculate total", "py", "# calculate total", "comment")
        has("// calculate total", "js", "// calculate total", "comment")
        has("@staticmethod", "py", "@staticmethod", "directive")
        has("#[derive(Debug)]", "rust", "#[derive(Debug)]", "directive")
        has("<button>Click</button>", "html", "<button>", "tag")
        has("<button>Click</button>", "html", "</button>", "tag")
        expect(slices("<button>Click</button>", "html").some((s) => s.slice == "Click")).toBe(false)
        has("<user>Ann</user>", "xml", "<user>", "tag")
        has('<img src="cat.png">', "html", "src", "attribute")
        has('<img src="cat.png">', "html", '"cat.png"', "string")
        has('<user id="1">', "xml", "id", "attribute")
        has("/^[a-z]+$/", "js", "/^[a-z]+$/", "regex")
        has("m/^\\d+$/", "perl", "m/^\\d+$/", "regex")
    })

    it("paints the thin rules and the live sample", () => {
        has("/** doc */", "js", "/** doc */", "comment", "bold")
        has('"""doc"""', "py", '"""doc"""', "comment", "bold")
        has('f"обычная строка"', "py", "f", "modifier")
        has('f"обычная строка"', "py", '"обычная строка"', "string")
        has('r"raw"', "py", "r", "modifier")
        has('b"bin"', "py", "b", "modifier")
        has("1_000i64", "rust", "1_000", "number")
        has("1_000i64", "rust", "i64", "type")
        has("0b1010", "rust", "0b", "modifier")
        has("0b1010", "rust", "1010", "number")
        has("1u32", "rust", "1", "number")
        has("1u32", "rust", "u32", "type")
        has("<?php $x = 1; ?>", "html", "<?php", "directive")
        has("<?php $x = 1; ?>", "html", "$x", "property")
        has("<?php $x = 1; ?>", "html", "1", "number")
        has("<?php $x = 1; ?>", "html", "?>", "directive")
        has('q = "SELECT name FROM users"', "py", "SELECT", "kw-flow")
        has('q = "SELECT name FROM users"', "py", "FROM", "kw-flow")
        has("T extends Foo", "ts", "T", "type")
        has("T extends Foo", "ts", "extends", "kw-flow")
        has("T extends Foo", "ts", "Foo", "type")
        has("fn f<'a>(x: &'a str)", "rust", "'a", "modifier")
        has("match x { _ => 1 }", "rust", "match", "kw-flow")
        has("match x { _ => 1 }", "rust", "_", "constant")
        let sample = [
            "// подсчитать скидку для активного пользователя",
            "@logExecution",
            "function getDiscount(user: User) {",
            "  if (user.isActive === true) {",
            "    return 0.15;",
            "  }",
            "  return `Скидка недоступна для ${user.name}`;",
            "}",
        ].join("\n")
        has(sample, "ts", "// подсчитать скидку для активного пользователя", "comment")
        has(sample, "ts", "@logExecution", "directive")
        has(sample, "ts", "function", "kw-decl")
        has(sample, "ts", "getDiscount", "function")
        has(sample, "ts", "User", "type")
        has(sample, "ts", "if", "kw-flow")
        has(sample, "ts", "return", "kw-flow")
        has(sample, "ts", "isActive", "property")
        has(sample, "ts", "true", "constant")
        has(sample, "ts", "0.15", "number")
        has(sample, "ts", "user", "interpolation")
        has(sample, "ts", "name", "property")
        plainAt(sample, "ts", "===")
        assertClean(highlightCode(sample, "ts"))
    })

    it("case-folds the language and leaves unknown identifiers plain", () => {
        has("let x = 1", "TypeScript", "let", "kw-decl")
        has('foo = "hi" // c', undefined, '"hi"', "string")
        has('foo = "hi" // c', undefined, "// c", "comment")
        expect(slices('foo = "hi" // c').some((s) => s.slice == "foo")).toBe(false)
    })

    it("does not paint keywords when the language is missing", () => {
        let text = "if (ok) return true"
        for (let lang of [undefined, "", "not-a-lang"] as const) {
            let painted = highlightCode(text, lang).some((span) => {
                let slice = text.slice(span.from, span.to)
                return slice == "if" || slice == "return"
            })
            expect(painted).toBe(false)
        }
        has(text, "ts", "if", "kw-flow")
        has(text, "ts", "return", "kw-flow")
        has(text, "ts", "true", "constant")
    })

    it("clears type position after values but not comments", () => {
        let num = "let n = flag ? 1 : 0\nconsole.log(n)"
        has(num, "ts", "log", "function")
        expect(slices(num, "ts").some((s) => s.slice == "console" || (s.slice == "log" && s.role == "type"))).toBe(
            false,
        )
        let str = 'let n = flag ? "a" : "b"\nconsole.log(n)'
        has(str, "ts", "log", "function")
        expect(slices(str, "ts").some((s) => s.slice == "console" || (s.slice == "log" && s.role == "type"))).toBe(
            false,
        )
        let re = "let n = flag ? 1 : /a/\nconsole.log(n)"
        has(re, "ts", "log", "function")
        expect(slices(re, "ts").some((s) => s.slice == "console" || (s.slice == "log" && s.role == "type"))).toBe(false)
        expect(slices("function\n1\nname", "ts").some((s) => s.slice == "name")).toBe(false)
        has(":\n/* c */\nUser", "ts", "User", "type")
    })

    it("paints an f-string hole inside a SQL-looking Python string", () => {
        has('f"SELECT {name} FROM t"', "py", "name", "interpolation")
        has('"SELECT name FROM users"', "py", "SELECT", "kw-flow")
        has('"SELECT name FROM users"', "py", "FROM", "kw-flow")
    })

    it("stops a YAML scalar before a closing brace", () => {
        has("{color: red}", "yaml", "red", "string")
        expect(slices("{color: red}", "yaml").some((s) => s.slice.includes("}"))).toBe(false)
    })

    it("paints reference types and leaves new.target plain as a type", () => {
        has("let x: &str", "rust", "str", "type")
        has("fn f<'a>(x: &'a str)", "rust", "str", "type")
        has("fn f<'a>(x: &'a str)", "rust", "'a", "modifier")
        expect(slices("new.target", "js").some((s) => s.slice == "target" && s.role == "type")).toBe(false)
        has("new Foo.Bar", "ts", "Foo", "type")
        has("new Foo.Bar", "ts", "Bar", "type")
    })

    it("keeps type position for reference sigils after parens and commas", () => {
        for (let text of ["let x: (&str, &str)", "fn f(&str)", "type X = (&str, &str)"]) {
            let spans = slices(text, "rust").filter((s) => s.slice == "str")
            let count = 0
            for (let i = 0; i < text.length; i++) if (text.startsWith("str", i)) count++
            expect(spans.length).toBe(count)
            expect(spans.every((s) => s.role == "type" && s.emphasis == null)).toBe(true)
        }
    })

    it("does not throw on deeply nested templates", () => {
        let text = ""
        for (let i = 0; i < 80; i++) text += "`${"
        text += "name"
        for (let i = 0; i < 80; i++) text += "}`"
        expect(() => highlightCode(text, "js")).not.toThrow()
        expect(Array.isArray(highlightCode(text, "js"))).toBe(true)
    })
})
