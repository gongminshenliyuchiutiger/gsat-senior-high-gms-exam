using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;

namespace ExamBuilder
{
    public class Option
    {
        public string key;
        public string text;
    }

    public class TableFillRow
    {
        public string item;
        public string answer;
    }

    public class TableTemplate
    {
        public string header1;
        public string header2;
        public List<string> checkOptions;
        public List<string> correctChecks;
        public string correctCheck;
        public bool isMultiSelect;
        public string explanationLabel;
        public string modelAnswer;
        public List<TableFillRow> fillRows;
        public string rawTableMarkdown;

        public TableTemplate()
        {
            checkOptions = new List<string>();
            correctChecks = new List<string>();
            fillRows = new List<TableFillRow>();
        }
    }

    public class Question
    {
        public string id;
        public int unit;
        public string unitName;
        public string section;
        public string type;
        public string typeName;
        public int number;
        public string groupTitle;
        public string groupContext;
        public string stem;
        public List<Option> options;
        public string answer;
        public string year;
        public string rate;
        public string explanation;
        public TableTemplate tableTemplate;

        public Question()
        {
            options = new List<Option>();
        }
    }

    public class Unit
    {
        public int id;
        public string title;
        public string subtitle;
        public string description;
        public List<Question> questions;

        public Unit()
        {
            questions = new List<Question>();
        }
    }

    public class MetaInfo
    {
        public string subtitle;
        public string desc;
    }

    class Program
    {
        static void Main(string[] args)
        {
            string rootDir = Directory.GetCurrentDirectory();
            Console.WriteLine("ExamBuilder starting in: " + rootDir);

            Dictionary<int, MetaInfo> unitMeta = new Dictionary<int, MetaInfo>();
            string metaFile = Path.Combine(rootDir, "單元名稱與內容.txt");
            if (File.Exists(metaFile))
            {
                string[] metaLines = File.ReadAllLines(metaFile, Encoding.UTF8);
                foreach (string line in metaLines)
                {
                    Match m = Regex.Match(line, @"單元\s*(\d+)[:：]\s*([^(（]+)[(（]([^)）]+)[)）]");
                    if (m.Success)
                    {
                        int uId = int.Parse(m.Groups[1].Value);
                        MetaInfo info = new MetaInfo();
                        info.subtitle = m.Groups[2].Value.Trim();
                        info.desc = m.Groups[3].Value.Trim();
                        unitMeta[uId] = info;
                    }
                }
            }

            List<Unit> allUnits = new List<Unit>();

            for (int uId = 1; uId <= 18; uId++)
            {
                string[] files = Directory.GetFiles(rootDir, "第 " + uId + " 單元 *.txt");
                if (files.Length == 0)
                {
                    files = Directory.GetFiles(rootDir, "第" + uId + "單元*.txt");
                }
                if (files.Length == 0)
                {
                    Console.WriteLine("Warning: Unit " + uId + " file not found!");
                    continue;
                }

                string filePath = files[0];
                string fileName = Path.GetFileNameWithoutExtension(filePath);
                Console.WriteLine("Processing Unit " + uId + ": " + fileName);

                string[] lines = File.ReadAllLines(filePath, Encoding.UTF8);

                string unitTitle = fileName;
                string subtitle = unitMeta.ContainsKey(uId) ? unitMeta[uId].subtitle : fileName;
                string description = unitMeta.ContainsKey(uId) ? unitMeta[uId].desc : "公民科核心素養試題與詳解";

                Unit unitObj = new Unit();
                unitObj.id = uId;
                unitObj.title = unitTitle;
                unitObj.subtitle = subtitle;
                unitObj.description = description;

                string currentSection = "公民素養營";
                string currentGroupContext = "";
                string currentGroupTitle = "";
                HashSet<int> currentGroupNumbers = new HashSet<int>();

                int i = 0;
                while (i < lines.Length)
                {
                    string rawLine = lines[i];
                    string line = rawLine.Trim();

                    if (line.StartsWith("## 公民素養營"))
                    {
                        currentSection = "公民素養營";
                        currentGroupContext = "";
                        currentGroupTitle = "";
                        currentGroupNumbers.Clear();
                        i++;
                        continue;
                    }
                    else if (line.StartsWith("## 二、混合題或非選擇題") || line.StartsWith("## 混合題或非選擇題"))
                    {
                        currentSection = "混合題或非選擇題";
                        currentGroupContext = "";
                        currentGroupTitle = "";
                        currentGroupNumbers.Clear();
                        i++;
                        continue;
                    }
                    else if (line.StartsWith("## 學測有試嗎"))
                    {
                        currentSection = "學測有試嗎";
                        currentGroupContext = "";
                        currentGroupTitle = "";
                        currentGroupNumbers.Clear();
                        i++;
                        continue;
                    }

                    if (IsGroupHeader(line))
                    {
                        currentGroupTitle = line.TrimStart('#', ' ').Trim();
                        currentGroupNumbers = ParseGroupQuestionNumbers(currentGroupTitle);
                        StringBuilder ctxBuilder = new StringBuilder();
                        i++;
                        while (i < lines.Length)
                        {
                            string ctxLine = lines[i].Trim();
                            if (IsQuestionStart(ctxLine) || IsGroupHeader(ctxLine) || ctxLine.StartsWith("## ") || ctxLine.StartsWith("### 一") || ctxLine.StartsWith("### 二"))
                            {
                                break;
                            }
                            if (ctxLine.StartsWith(">"))
                            {
                                ctxLine = ctxLine.TrimStart('>', ' ').Trim();
                            }
                            if (!string.IsNullOrEmpty(ctxLine) && ctxLine != "---")
                            {
                                ctxBuilder.AppendLine(ctxLine);
                            }
                            i++;
                        }
                        currentGroupContext = ctxBuilder.ToString().Trim();
                        continue;
                    }

                    int qNum;
                    string answer;
                    string initialStem;
                    string year;
                    string rate;

                    if (TryParseQuestionStart(line, out qNum, out answer, out initialStem, out year, out rate))
                    {
                        i++;
                        List<string> qLines = new List<string>();
                        if (!string.IsNullOrEmpty(initialStem))
                        {
                            qLines.Add(initialStem);
                        }

                        while (i < lines.Length)
                        {
                            string qLine = lines[i].Trim();
                            if (IsQuestionStart(qLine) || IsGroupHeader(qLine) || qLine.StartsWith("### ") || qLine.StartsWith("## ") || qLine == "---")
                            {
                                if (qLine == "---") i++;
                                break;
                            }
                            qLines.Add(lines[i]);
                            i++;
                        }

                        bool belongsToGroup = currentGroupNumbers.Contains(qNum);
                        string grpTitle = belongsToGroup ? currentGroupTitle : null;
                        string grpCtx = belongsToGroup ? currentGroupContext : null;

                        Question q = ParseQuestionBlock(uId, unitTitle, currentSection, qNum, answer, year, rate, grpTitle, grpCtx, qLines);
                        unitObj.questions.Add(q);

                        if (!belongsToGroup && currentGroupNumbers.Count > 0 && qNum > currentGroupNumbers.Max())
                        {
                            currentGroupTitle = "";
                            currentGroupContext = "";
                            currentGroupNumbers.Clear();
                        }
                        continue;
                    }

                    i++;
                }

                Console.WriteLine(" -> Unit " + uId + ": " + unitObj.questions.Count + " questions parsed.");
                allUnits.Add(unitObj);
            }

            int totalQuestions = 0;
            foreach (Unit u in allUnits)
            {
                totalQuestions += u.questions.Count;
            }
            Console.WriteLine("\nAll 18 units parsed successfully! Total questions: " + totalQuestions);

            string jsPath = Path.Combine(rootDir, "js", "exam-data.js");
            StringBuilder sb = new StringBuilder();
            sb.AppendLine("/**");
            sb.AppendLine(" * 學測/會考公民神模考系統 - 題庫完整資料庫 (全 18 單元完整收錄)");
            sb.AppendLine(" * 自動生成時間: " + DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss"));
            sb.AppendLine(" * 總計單元: 18 個單元，共收錄 " + totalQuestions + " 道題");
            sb.AppendLine(" */");
            sb.AppendLine();
            sb.AppendLine("const EXAM_DATABASE = {");
            sb.AppendLine("  units: [");

            for (int uIdx = 0; uIdx < allUnits.Count; uIdx++)
            {
                Unit u = allUnits[uIdx];
                sb.AppendLine("    {");
                sb.AppendLine("      id: " + u.id + ",");
                sb.AppendLine("      title: " + ToJsonString(u.title) + ",");
                sb.AppendLine("      subtitle: " + ToJsonString(u.subtitle) + ",");
                sb.AppendLine("      description: " + ToJsonString(u.description) + ",");
                sb.AppendLine("      questions: [");

                for (int qIdx = 0; qIdx < u.questions.Count; qIdx++)
                {
                    Question q = u.questions[qIdx];
                    sb.AppendLine("        {");
                    sb.AppendLine("          id: " + ToJsonString(q.id) + ",");
                    sb.AppendLine("          unit: " + q.unit + ",");
                    sb.AppendLine("          unitName: " + ToJsonString(q.unitName) + ",");
                    sb.AppendLine("          section: " + ToJsonString(q.section) + ",");
                    sb.AppendLine("          type: " + ToJsonString(q.type) + ",");
                    sb.AppendLine("          typeName: " + ToJsonString(q.typeName) + ",");
                    sb.AppendLine("          number: " + q.number + ",");
                    if (!string.IsNullOrEmpty(q.groupTitle))
                        sb.AppendLine("          groupTitle: " + ToJsonString(q.groupTitle) + ",");
                    if (q.groupContext != null)
                        sb.AppendLine("          groupContext: " + ToJsonString(q.groupContext) + ",");
                    sb.AppendLine("          stem: " + ToJsonString(q.stem) + ",");
                    sb.AppendLine("          options: [");
                    for (int oIdx = 0; oIdx < q.options.Count; oIdx++)
                    {
                        Option opt = q.options[oIdx];
                        string comma = oIdx < q.options.Count - 1 ? "," : "";
                        sb.AppendLine("            { key: " + ToJsonString(opt.key) + ", text: " + ToJsonString(opt.text) + " }" + comma);
                    }
                    sb.AppendLine("          ],");
                    sb.AppendLine("          answer: " + ToJsonString(q.answer) + ",");
                    if (q.year != null)
                        sb.AppendLine("          year: " + ToJsonString(q.year) + ",");
                    if (q.rate != null)
                        sb.AppendLine("          rate: " + ToJsonString(q.rate) + ",");
                    
                    if (q.tableTemplate != null)
                    {
                        sb.AppendLine("          tableTemplate: {");
                        sb.AppendLine("            header1: " + ToJsonString(q.tableTemplate.header1) + ",");
                        sb.AppendLine("            header2: " + ToJsonString(q.tableTemplate.header2) + ",");
                        sb.AppendLine("            isMultiSelect: " + (q.tableTemplate.isMultiSelect ? "true" : "false") + ",");
                        sb.AppendLine("            checkOptions: [" + string.Join(", ", q.tableTemplate.checkOptions.Select(c => ToJsonString(c)).ToArray()) + "],");
                        sb.AppendLine("            correctChecks: [" + string.Join(", ", q.tableTemplate.correctChecks.Select(c => ToJsonString(c)).ToArray()) + "],");
                        sb.AppendLine("            correctCheck: " + ToJsonString(q.tableTemplate.correctCheck) + ",");
                        sb.AppendLine("            explanationLabel: " + ToJsonString(q.tableTemplate.explanationLabel) + ",");
                        sb.AppendLine("            modelAnswer: " + ToJsonString(q.tableTemplate.modelAnswer) + ",");
                        sb.AppendLine("            fillRows: [");
                        for (int frIdx = 0; frIdx < q.tableTemplate.fillRows.Count; frIdx++)
                        {
                            TableFillRow fr = q.tableTemplate.fillRows[frIdx];
                            string frComma = frIdx < q.tableTemplate.fillRows.Count - 1 ? "," : "";
                            sb.AppendLine("              { item: " + ToJsonString(fr.item) + ", answer: " + ToJsonString(fr.answer) + " }" + frComma);
                        }
                        sb.AppendLine("            ],");
                        sb.AppendLine("            rawTableMarkdown: " + ToJsonString(q.tableTemplate.rawTableMarkdown));
                        sb.AppendLine("          },");
                    }

                    sb.AppendLine("          explanation: " + ToJsonString(q.explanation));
                    
                    string qComma = qIdx < u.questions.Count - 1 ? "," : "";
                    sb.AppendLine("        }" + qComma);
                }

                sb.AppendLine("      ]");
                string uComma = uIdx < allUnits.Count - 1 ? "," : "";
                sb.AppendLine("    }" + uComma);
            }

            sb.AppendLine("  ]");
            sb.AppendLine("};");
            sb.AppendLine();
            sb.AppendLine("if (typeof window !== 'undefined') {");
            sb.AppendLine("  window.EXAM_DATABASE = EXAM_DATABASE;");
            sb.AppendLine("}");
            sb.AppendLine("if (typeof module !== 'undefined' && module.exports) {");
            sb.AppendLine("  module.exports = EXAM_DATABASE;");
            sb.AppendLine("}");

            File.WriteAllText(jsPath, sb.ToString(), Encoding.UTF8);
            Console.WriteLine("SUCCESS! Written " + jsPath + " successfully.");
        }

        static Question ParseQuestionBlock(int unitId, string unitTitle, string section, int qNum, string initialAnswer, string year, string rate, string groupTitle, string groupCtx, List<string> lines)
        {
            Question q = new Question();
            string secCode = "base";
            if (section == "學測有試嗎") secCode = "past";
            else if (section == "混合題或非選擇題") secCode = "mix";

            q.id = "u" + unitId + "_s" + secCode + "_q" + qNum;
            q.unit = unitId;
            q.unitName = unitTitle;
            q.section = section;
            q.number = qNum;
            q.groupTitle = string.IsNullOrEmpty(groupTitle) ? null : groupTitle;
            q.groupContext = string.IsNullOrEmpty(groupCtx) ? null : groupCtx;
            q.year = string.IsNullOrEmpty(year) ? null : year;
            q.rate = string.IsNullOrEmpty(rate) ? null : rate;
            q.answer = initialAnswer;

            StringBuilder stemBuilder = new StringBuilder();
            List<Option> options = new List<Option>();
            TableTemplate tblTemplate = null;
            bool readingOptions = false;

            int i = 0;
            while (i < lines.Count)
            {
                string rawLine = lines[i];
                string line = rawLine.Trim();

                if (string.IsNullOrEmpty(line))
                {
                    i++;
                    continue;
                }

                if (line.StartsWith("|"))
                {
                    List<string> tblLines = new List<string>();
                    while (i < lines.Count && lines[i].Trim().StartsWith("|"))
                    {
                        tblLines.Add(lines[i].Trim());
                        i++;
                    }

                    if (!readingOptions)
                    {
                        // Check if it's an option table
                        bool hasOptionRow = false;
                        for (int r = 1; r < tblLines.Count; r++)
                        {
                            string rowLine = tblLines[r];
                            if (Regex.IsMatch(rowLine, @"^\|\s*[-:]+\s*\|")) continue;
                            string[] cells = rowLine.Trim('|').Split('|').Select(c => c.Trim()).ToArray();
                            if (cells.Length > 0 && Regex.IsMatch(cells[0], @"^[(（]([A-E])[)）]"))
                            {
                                hasOptionRow = true;
                                Match mOpt = Regex.Match(cells[0], @"^[(（]([A-E])[)）]");
                                Option opt = new Option();
                                opt.key = mOpt.Groups[1].Value.ToUpper();
                                string firstCell = Regex.Replace(cells[0], @"^[(（][A-E][)）]\s*", "").Trim();
                                List<string> cleanCells = new List<string>();
                                cleanCells.Add(firstCell);
                                for (int cIdx = 1; cIdx < cells.Length; cIdx++) cleanCells.Add(cells[cIdx]);
                                opt.text = string.Join(" ｜ ", cleanCells.ToArray());
                                if (!options.Any(o => o.key == opt.key)) options.Add(opt);
                            }
                        }

                        // Always append data table or option comparison table to stemBuilder
                        stemBuilder.AppendLine();
                        foreach (string tl in tblLines) stemBuilder.AppendLine(tl);
                        stemBuilder.AppendLine();

                        if (hasOptionRow)
                        {
                            readingOptions = true;
                        }
                    }
                    else
                    {
                        // Answering table after options or at end
                        TableTemplate t = ParseTable(tblLines, stemBuilder.ToString(), options);
                        if (t != null)
                        {
                            tblTemplate = t;
                        }
                        else
                        {
                            stemBuilder.AppendLine();
                            foreach (string tl in tblLines) stemBuilder.AppendLine(tl);
                            stemBuilder.AppendLine();
                        }
                    }
                    continue;
                }

                // Check for Option pattern: - (A) ... or (A) ... or - A. ...
                Match optMatch = Regex.Match(line, @"^[-*]?\s*[(（]([A-E])[)）][.、\s]*(.*)$");
                if (!optMatch.Success)
                {
                    optMatch = Regex.Match(line, @"^[-*]?\s*([A-E])[.、]\s*(.*)$");
                }

                if (optMatch.Success)
                {
                    readingOptions = true;
                    Option opt = new Option();
                    opt.key = optMatch.Groups[1].Value.ToUpper();
                    opt.text = optMatch.Groups[2].Value.Trim();
                    options.Add(opt);
                }
                else if (readingOptions)
                {
                    if (options.Count > 0)
                    {
                        options[options.Count - 1].text += " " + line;
                    }
                }
                else
                {
                    stemBuilder.AppendLine(line);
                }
                i++;
            }

            // If no options were found and section is mixed/non-choice and no template yet, check if stem ends with an answering table
            if (options.Count == 0 && tblTemplate == null)
            {
                string fullStem = stemBuilder.ToString().Trim();
                string[] sLines = fullStem.Split('\n');
                List<string> lastTbl = new List<string>();
                int endIdx = sLines.Length - 1;
                while (endIdx >= 0 && string.IsNullOrEmpty(sLines[endIdx].Trim())) endIdx--;
                while (endIdx >= 0 && sLines[endIdx].Trim().StartsWith("|"))
                {
                    lastTbl.Insert(0, sLines[endIdx].Trim());
                    endIdx--;
                }

                if (lastTbl.Count >= 2)
                {
                    TableTemplate t = ParseTable(lastTbl, fullStem, options);
                    if (t != null && (t.checkOptions.Count > 0 || t.fillRows.Count > 0 || !string.IsNullOrEmpty(t.modelAnswer)))
                    {
                        tblTemplate = t;
                        StringBuilder cleanStem = new StringBuilder();
                        for (int k = 0; k <= endIdx; k++)
                        {
                            cleanStem.AppendLine(sLines[k]);
                        }
                        stemBuilder.Clear();
                        stemBuilder.Append(cleanStem.ToString());
                    }
                }
            }

            q.stem = stemBuilder.ToString().Trim();
            q.options = options;
            q.tableTemplate = tblTemplate;

            // Determine question type & typeName
            if (options.Count > 0)
            {
                if (q.answer.Contains(",") || options.Count > 4)
                {
                    q.type = "multiple";
                    q.typeName = section == "學測有試嗎" ? "歷屆學測試題 (多選)" : "多選題";
                }
                else
                {
                    q.type = "single";
                    q.typeName = section == "學測有試嗎" ? "歷屆學測試題" : "單選題";
                }
            }
            else if (tblTemplate != null)
            {
                q.type = "non_choice";
                q.typeName = section == "學測有試嗎" ? "歷屆學測非選題" : "混合/非選題";
            }
            else
            {
                q.type = "non_choice";
                q.typeName = section == "學測有試嗎" ? "歷屆學測非選題" : "非選擇題";
            }

            // Generate comprehensive and high quality explanation
            q.explanation = GenerateDetailedExplanation(q, unitId, unitTitle);

            return q;
        }

        static TableTemplate ParseTable(List<string> tableLines, string currentStem, List<Option> options)
        {
            if (tableLines.Count < 2) return null;

            TableTemplate t = new TableTemplate();
            t.rawTableMarkdown = string.Join("\n", tableLines.ToArray());

            string headerLine = tableLines[0];
            string[] headers = headerLine.Trim('|').Split('|').Select(h => h.Trim()).ToArray();

            // Special case: 2-line single-item answering table e.g. | 提高評分的類別 | 一、二、四 | \n | :---: | :--- |
            if (tableLines.Count == 2 && headers.Length == 2)
            {
                t.header1 = headers[0];
                t.header2 = "填答內容 / 說明";
                t.explanationLabel = headers[0];
                t.modelAnswer = headers[1];
                TableFillRow fr = new TableFillRow();
                fr.item = headers[0];
                fr.answer = headers[1];
                t.fillRows.Add(fr);
                return t;
            }

            t.header1 = headers.Length > 0 ? headers[0] : "項目";
            t.header2 = headers.Length > 1 ? headers[1] : "內容 / 理由說明";
            t.explanationLabel = t.header2;

            if (t.header1.Contains("多選") || currentStem.Contains("多選") || currentStem.Contains("哪些"))
            {
                t.isMultiSelect = true;
            }

            // Check if rows are options (A), (B), (C), (D)
            bool isOptionTable = false;
            for (int r = 1; r < tableLines.Count; r++)
            {
                string rowLine = tableLines[r];
                if (Regex.IsMatch(rowLine, @"^\|\s*[-:]+\s*\|")) continue;
                string[] cells = rowLine.Trim('|').Split('|').Select(c => c.Trim()).ToArray();
                if (cells.Length > 0)
                {
                    Match mOpt = Regex.Match(cells[0], @"^[(（]([A-E])[)）]");
                    if (mOpt.Success)
                    {
                        isOptionTable = true;
                        Option opt = new Option();
                        opt.key = mOpt.Groups[1].Value.ToUpper();
                        string firstCell = Regex.Replace(cells[0], @"^[(（][A-E][)）]\s*", "").Trim();
                        List<string> cleanCells = new List<string>();
                        cleanCells.Add(firstCell);
                        for (int cIdx = 1; cIdx < cells.Length; cIdx++)
                        {
                            cleanCells.Add(cells[cIdx]);
                        }
                        opt.text = string.Join(" ｜ ", cleanCells.ToArray());
                        if (!options.Any(o => o.key == opt.key))
                        {
                            options.Add(opt);
                        }
                    }
                }
            }

            if (isOptionTable)
            {
                // Option table, markdown will be kept in stem
                return null;
            }

            // Parse mixed / non-choice rows
            for (int r = 1; r < tableLines.Count; r++)
            {
                string rowLine = tableLines[r];
                if (Regex.IsMatch(rowLine, @"^\|\s*[-:]+\s*\|")) continue;

                string[] cells = rowLine.Trim('|').Split('|').Select(c => c.Trim()).ToArray();
                if (cells.Length >= 2)
                {
                    string col1 = cells[0];
                    string col2 = cells[1];

                    // Check for Checkbox patterns: ☑, ☐, □, \checkmark, square, etc.
                    if (col1.Contains("☑") || col1.Contains("☐") || col1.Contains("□") || col1.Contains("checkmark") || col1.Contains("square") || col1.Contains("✔"))
                    {
                        string[] checkParts = col1.Split(new string[] { "<br>", "<br/>", "\n", "\\n" }, StringSplitOptions.RemoveEmptyEntries);
                        foreach (string cp in checkParts)
                        {
                            string item = cp.Trim();
                            bool isChecked = item.Contains("☑") || item.Contains("checkmark") || item.Contains("✔");
                            string label = item;
                            label = label.Replace("**", "").Replace("*", "");
                            label = Regex.Replace(label, @"\$\\(?:text|rlap|checkmark|square|Box)+[^$]*\$", "");
                            label = Regex.Replace(label, @"\\[a-zA-Z]+", "");
                            label = Regex.Replace(label, @"[\$☑☐□✔\(\)\{\}\\]+", "");
                            label = Regex.Replace(label, @"^(?:square|checkmark)\$?", "", RegexOptions.IgnoreCase);
                            label = label.Trim();

                            if (!string.IsNullOrEmpty(label))
                            {
                                if (!t.checkOptions.Contains(label))
                                    t.checkOptions.Add(label);

                                if (isChecked && !t.correctChecks.Contains(label))
                                    t.correctChecks.Add(label);
                            }
                        }

                        t.correctCheck = string.Join(", ", t.correctChecks.ToArray());
                        t.modelAnswer = col2.Replace("**", "").Trim();
                    }
                    else if (col1.Contains("甲") || col1.Contains("乙") || col1.Contains("優點") || col1.Contains("缺點") || col1.Contains("權利") || col1.Contains("政府單位") || col1.Contains("理由"))
                    {
                        TableFillRow fr = new TableFillRow();
                        fr.item = col1.Replace("**", "").Trim();
                        fr.answer = col2.Replace("**", "").Trim();
                        t.fillRows.Add(fr);
                        if (string.IsNullOrEmpty(t.modelAnswer))
                        {
                            t.modelAnswer = fr.item + "：" + fr.answer;
                        }
                        else
                        {
                            t.modelAnswer += "；" + fr.item + "：" + fr.answer;
                        }
                    }
                    else
                    {
                        // Single summary row or text answer row
                        if (string.IsNullOrEmpty(t.modelAnswer))
                        {
                            t.modelAnswer = col2;
                        }
                    }
                }
                else if (cells.Length == 1)
                {
                    if (string.IsNullOrEmpty(t.modelAnswer))
                    {
                        t.modelAnswer = cells[0];
                    }
                }
            }

            return t;
        }

        static string GenerateDetailedExplanation(Question q, int unitId, string unitTitle)
        {
            if (q.tableTemplate != null)
            {
                StringBuilder sb = new StringBuilder();
                sb.AppendLine("【參考答案與解析】");
                if (q.tableTemplate.correctChecks.Count > 0)
                {
                    sb.AppendLine("● 正確勾選項目：" + string.Join("、", q.tableTemplate.correctChecks.ToArray()));
                }
                if (q.tableTemplate.fillRows.Count > 0)
                {
                    foreach (var fr in q.tableTemplate.fillRows)
                    {
                        sb.AppendLine("● " + fr.item + "：" + fr.answer);
                    }
                }
                else if (!string.IsNullOrEmpty(q.tableTemplate.modelAnswer))
                {
                    sb.AppendLine("● " + (q.tableTemplate.explanationLabel ?? "判斷理由與說明") + "：" + q.tableTemplate.modelAnswer);
                }
                return sb.ToString().Trim();
            }

            // 選擇題詳解由 AI 即時生成
            return null;
        }

        static string GetUnitCoreConcept(int unitId, string stem, string ans)
        {
            switch (unitId)
            {
                case 1:
                    return "公民身分著重於國家與成員間的權利義務關係，涵蓋人身自由、參政權、社會權等基本人權之落實與保障。";
                case 2:
                    return "國家構成要素包含人民、領土、政府與主權；主權對內具有最高統治權力，對外具備獨立自主性與國際交往能力。";
                case 3:
                    return "民主憲政體制依行政與立法互動分為內閣制、總統制與半總統制，並透過覆議、不信任案、彈劾及違憲審查落實權力制衡。";
                case 4:
                    return "人民參政包含選舉、罷免、創制、複決（公民投票）及多元倡議，為實踐主權在民與民主正當性之核心機制。";
                case 5:
                    return "多元文化強調各族群文化之平等尊重，並藉由積極平權措施與社會安全制度保障處境不利群體之實質正義。";
                case 6:
                    return "公共意見形成仰賴言論自由與健全的第四權媒體監督，閱聽人應具備媒體素養以辨識假訊息與民調效度。";
                case 7:
                    return "法治國原則要求政府一切施政恪遵憲法與法律，國家公權力限制人民權利時須符合法律保留原則與比例原則。";
                case 8:
                    return "憲法保障人民之平等權、自由權、受益權與參政權，並透過司法院憲法法庭判決落實基本權利之終局救濟與人性尊嚴維護。";
                case 9:
                    return "行政法規範行政機關依法行政與正當法律程序，人民若權利受行政處分侵害，得循訴願與行政訴訟尋求救濟。";
                case 10:
                    return "民法規範私法自治與財產權保障，包含物權之支配性、債權之請求權、契約自由原則與婚姻遺產繼承之應繼分與特留分。";
                case 11:
                    return "刑法以罪刑法定原則為基石，嚴守刑事訴訟程序正義，並兼顧應報、一般預防與受刑人之特別預防（教化再社會化）。";
                case 12:
                    return "勞動法制透過《勞基法》設定法定基準，並保障勞動三權（團結權、團體協商權、爭議權）以平衡勞資地位之實質對等。";
                case 13:
                    return "經濟學探討資源有限下的選擇，透過機會成本評估與比較利益法則進行專業分工，使整體社會生產與消費效益最大化。";
                case 14:
                    return "需求與供給法則決定市場均衡價格與交易量，價格機能（看不見的手）引導資源配置並反映消費者與生產者偏好。";
                case 15:
                    return "政府干預市場（如價格上限、價格下限、補貼與課稅）會改變市場均衡與社會總剩餘，可能產生無謂損失。";
                case 16:
                    return "市場失靈成因包括外部性、公共財（非排他、非敵對）、不完全競爭與資訊不對稱，政府得課徵皮古稅或立法管制以矯正。";
                case 17:
                    return "國際貿易促進各國發揮比較利益，自由貿易與關稅政策影響進出口產業利得，匯率升貶亦影響國際收支。";
                case 18:
                    return "衡量總體經濟常以 GDP、GNI 為指標，永續發展則強調經濟成長兼顧環境保護、資源永續與綠色國民所得。";
                default:
                    return "掌握題幹關鍵字與題意，結合理論核心觀念作答。";
            }
        }

        static bool IsGroupHeader(string line)
        {
            if (string.IsNullOrEmpty(line)) return false;
            string trimmed = line.Trim();
            return Regex.IsMatch(trimmed, @"^#{2,4}\s*第\s*[\d.、，,與和及\s～~\-–—到至]+題.*(?:題組|題為)");
        }

        static HashSet<int> ParseGroupQuestionNumbers(string headerText)
        {
            HashSet<int> nums = new HashSet<int>();
            if (string.IsNullOrEmpty(headerText)) return nums;

            // Pattern 1: Range like 第 18～20 題, 第 15-17 題, 第 23.～25. 題, 第 18~20 題, 第 5 到 7 題
            Match mRange = Regex.Match(headerText, @"第\s*(\d+)\.?\s*[～~\-–—到至]\s*(\d+)\.?\s*題");
            if (mRange.Success)
            {
                int start = int.Parse(mRange.Groups[1].Value);
                int end = int.Parse(mRange.Groups[2].Value);
                for (int n = Math.Min(start, end); n <= Math.Max(start, end); n++)
                {
                    nums.Add(n);
                }
                return nums;
            }

            // Pattern 2: List like 第 11、12 題, 第 19.、20. 題, 第 6.、7. 題, 第 2、3 題, 第 13、14 題
            Match mList = Regex.Match(headerText, @"第\s*([\d.、，,與和及\s]+)\s*題");
            if (mList.Success)
            {
                MatchCollection digitMatches = Regex.Matches(mList.Groups[1].Value, @"\d+");
                foreach (Match dm in digitMatches)
                {
                    nums.Add(int.Parse(dm.Value));
                }
                return nums;
            }

            return nums;
        }

        static bool IsQuestionStart(string line)
        {
            int qNum;
            string ans, stem, yr, rate;
            return TryParseQuestionStart(line, out qNum, out ans, out stem, out yr, out rate);
        }

        static bool TryParseQuestionStart(string line, out int qNum, out string answer, out string stem, out string year, out string rate)
        {
            qNum = 0;
            answer = "";
            stem = "";
            year = "";
            rate = "";

            if (string.IsNullOrEmpty(line)) return false;

            // Pattern 1: #### 1. 【答案：(C)】 or #### 1. 【答案：C】 or #### 1.
            Match m1 = Regex.Match(line, @"^####\s*(\d+)\.\s*(.*)$");
            if (m1.Success)
            {
                qNum = int.Parse(m1.Groups[1].Value);
                string rest = m1.Groups[2].Value.Trim();
                ParseAnswerAndYear(rest, out answer, out year, out rate, out stem);
                return true;
            }

            // Pattern 2: **【答案：D】 1.** 題目... or **【答案：(D)】 1.** or 【答案：D】 1.
            Match m2 = Regex.Match(line, @"^(?:\*\*)?【答案：\s*([^】]+)】(?:\*\*)?\s*(\d+)\.(?:\*\*)?\s*(.*)$");
            if (m2.Success)
            {
                qNum = int.Parse(m2.Groups[2].Value);
                answer = NormalizeAnswer(m2.Groups[1].Value);
                string rest = m2.Groups[3].Value.Trim();
                string dummyAns;
                ParseAnswerAndYear(rest, out dummyAns, out year, out rate, out stem);
                return true;
            }

            // Pattern 3: **1.** 或 **1.** 【答案：D】
            Match m3 = Regex.Match(line, @"^\*\*(\d+)\.\*\*\s*(.*)$");
            if (m3.Success)
            {
                qNum = int.Parse(m3.Groups[1].Value);
                string rest = m3.Groups[2].Value.Trim();
                ParseAnswerAndYear(rest, out answer, out year, out rate, out stem);
                return true;
            }

            // Pattern 4: 1. 或 1. 【答案：D】
            Match m4 = Regex.Match(line, @"^(\d+)\.\s+(.*)$");
            if (m4.Success)
            {
                qNum = int.Parse(m4.Groups[1].Value);
                string rest = m4.Groups[2].Value.Trim();
                ParseAnswerAndYear(rest, out answer, out year, out rate, out stem);
                return true;
            }

            return false;
        }

        static void ParseAnswerAndYear(string input, out string answer, out string year, out string rate, out string stem)
        {
            answer = "";
            year = "";
            rate = "";
            stem = input;

            Match ansMatch = Regex.Match(input, @"【答案：\s*([^】]+)】");
            if (ansMatch.Success)
            {
                answer = NormalizeAnswer(ansMatch.Groups[1].Value);
                stem = stem.Replace(ansMatch.Value, "").Trim();
            }

            Match yrMatch = Regex.Match(input, @"（(\d+)\.\s*學測(?:[，,]\s*答對率\s*(\d+%))?）");
            if (yrMatch.Success)
            {
                year = yrMatch.Groups[1].Value + " 學測";
                if (yrMatch.Groups[2].Success)
                {
                    rate = "答對率 " + yrMatch.Groups[2].Value;
                }
                stem = stem.Replace(yrMatch.Value, "").Trim();
            }

            stem = stem.TrimStart('*', ' ').TrimEnd('*', ' ').Trim();
        }

        static string NormalizeAnswer(string raw)
        {
            MatchCollection matches = Regex.Matches(raw, @"[A-E]");
            List<string> letters = new List<string>();
            foreach (Match m in matches)
            {
                if (!letters.Contains(m.Value))
                    letters.Add(m.Value);
            }
            return string.Join(", ", letters.ToArray());
        }

        static string ToJsonString(string text)
        {
            if (text == null) return "null";
            StringBuilder sb = new StringBuilder("\"");
            foreach (char c in text)
            {
                switch (c)
                {
                    case '\\': sb.Append("\\\\"); break;
                    case '\"': sb.Append("\\\""); break;
                    case '\n': sb.Append("\\n"); break;
                    case '\r': sb.Append("\\r"); break;
                    case '\t': sb.Append("\\t"); break;
                    case '\b': sb.Append("\\b"); break;
                    case '\f': sb.Append("\\f"); break;
                    default:
                        if (c < 32)
                        {
                            sb.AppendFormat("\\u{0:x4}", (int)c);
                        }
                        else
                        {
                            sb.Append(c);
                        }
                        break;
                }
            }
            sb.Append("\"");
            return sb.ToString();
        }
    }
}
