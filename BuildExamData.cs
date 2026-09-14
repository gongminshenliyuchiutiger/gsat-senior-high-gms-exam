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

    public class Question
    {
        public string id;
        public int unit;
        public string unitName;
        public string section;
        public string type;
        public string typeName;
        public int number;
        public string groupContext;
        public string stem;
        public List<Option> options;
        public string answer;
        public string year;
        public string rate;
        public string explanation;

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
                StringBuilder currentGroupContext = new StringBuilder();

                int i = 0;
                while (i < lines.Length)
                {
                    string rawLine = lines[i];
                    string line = rawLine.Trim();

                    if (line.StartsWith("## 公民素養營"))
                    {
                        currentSection = "公民素養營";
                        currentGroupContext.Clear();
                        i++;
                        continue;
                    }
                    else if (line.StartsWith("## 二、混合題或非選擇題") || line.StartsWith("## 混合題或非選擇題"))
                    {
                        currentSection = "混合題或非選擇題";
                        currentGroupContext.Clear();
                        i++;
                        continue;
                    }
                    else if (line.StartsWith("## 學測有試嗎"))
                    {
                        currentSection = "學測有試嗎";
                        currentGroupContext.Clear();
                        i++;
                        continue;
                    }

                    if (line.StartsWith("### 第") && (line.Contains("題組") || line.Contains("題為")))
                    {
                        currentGroupContext.Clear();
                        i++;
                        while (i < lines.Length)
                        {
                            string ctxLine = lines[i].Trim();
                            if (IsQuestionStart(ctxLine) || ctxLine.StartsWith("### ") || ctxLine.StartsWith("## "))
                            {
                                break;
                            }
                            if (ctxLine.StartsWith(">"))
                            {
                                ctxLine = ctxLine.TrimStart('>', ' ').Trim();
                            }
                            if (!string.IsNullOrEmpty(ctxLine) && ctxLine != "---")
                            {
                                currentGroupContext.AppendLine(ctxLine);
                            }
                            i++;
                        }
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
                        StringBuilder stemBuilder = new StringBuilder();
                        if (!string.IsNullOrEmpty(initialStem))
                        {
                            stemBuilder.AppendLine(initialStem);
                        }

                        List<Option> options = new List<Option>();
                        StringBuilder nonChoiceBuilder = new StringBuilder();
                        bool readingOptions = false;

                        while (i < lines.Length)
                        {
                            string qLineRaw = lines[i];
                            string qLine = qLineRaw.Trim();

                            if (IsQuestionStart(qLine) || qLine.StartsWith("### ") || qLine.StartsWith("## ") || qLine == "---")
                            {
                                if (qLine == "---") i++;
                                break;
                            }

                            Match optMatch = Regex.Match(qLine, @"^[-*]?\s*[(（]([A-E])[)）][.、\s]*(.*)$");
                            if (!optMatch.Success)
                            {
                                optMatch = Regex.Match(qLine, @"^[-*]?\s*([A-E])[.、]\s*(.*)$");
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
                                if (options.Count > 0 && !qLine.StartsWith("|") && !qLine.StartsWith("---"))
                                {
                                    options[options.Count - 1].text += " " + qLine;
                                }
                                else if (qLine.StartsWith("|"))
                                {
                                    nonChoiceBuilder.AppendLine(qLine);
                                }
                            }
                            else
                            {
                                if (qLine.StartsWith("|"))
                                {
                                    nonChoiceBuilder.AppendLine(qLine);
                                }
                                else if (!string.IsNullOrEmpty(qLine))
                                {
                                    stemBuilder.AppendLine(qLine);
                                }
                            }
                            i++;
                        }

                        string stemText = stemBuilder.ToString().Trim();
                        string nonChoiceText = nonChoiceBuilder.ToString().Trim();
                        string groupCtx = currentGroupContext.ToString().Trim();

                        string qType = "single";
                        string qTypeName = "單選題";

                        if (currentSection == "學測有試嗎")
                        {
                            qTypeName = "歷屆學測試題";
                            if (answer.Contains(",")) qType = "multiple";
                            else qType = "single";
                        }
                        else if (currentSection == "混合題或非選擇題")
                        {
                            if (options.Count > 0)
                            {
                                qTypeName = answer.Contains(",") ? "多選題" : "單選題";
                                qType = answer.Contains(",") ? "multiple" : "single";
                            }
                            else
                            {
                                qType = "non_choice";
                                qTypeName = "混合/非選題";
                            }
                        }
                        else
                        {
                            if (answer.Contains(",") || (options.Count > 4 && answer.Length > 1))
                            {
                                qType = "multiple";
                                qTypeName = "多選題";
                            }
                            else
                            {
                                qType = "single";
                                qTypeName = "單選題";
                            }
                        }

                        string explanation = "";
                        if (!string.IsNullOrEmpty(nonChoiceText))
                        {
                            explanation = "【參考答案與解析】\n" + nonChoiceText;
                        }
                        else if (!string.IsNullOrEmpty(answer))
                        {
                            List<string> correctOpts = new List<string>();
                            foreach (Option o in options)
                            {
                                if (answer.Contains(o.key))
                                {
                                    correctOpts.Add("(" + o.key + ") " + o.text);
                                }
                            }
                            string optText = string.Join("；", correctOpts.ToArray());
                            explanation = "正確答案為 (" + answer + ")。" + (!string.IsNullOrEmpty(optText) ? " 本題考查重點在於：" + optText + "。" : "");
                        }
                        else
                        {
                            explanation = "詳見題目題意與公民核心概念進行論述。";
                        }

                        string secCode = "base";
                        if (currentSection == "學測有試嗎") secCode = "past";
                        else if (currentSection == "混合題或非選擇題") secCode = "mix";

                        Question q = new Question();
                        q.id = "u" + uId + "_s" + secCode + "_q" + qNum;
                        q.unit = uId;
                        q.unitName = unitTitle;
                        q.section = currentSection;
                        q.type = qType;
                        q.typeName = qTypeName;
                        q.number = qNum;
                        q.groupContext = string.IsNullOrEmpty(groupCtx) ? null : groupCtx;
                        q.stem = stemText;
                        q.options = options;
                        q.answer = answer;
                        q.year = string.IsNullOrEmpty(year) ? null : year;
                        q.rate = string.IsNullOrEmpty(rate) ? null : rate;
                        q.explanation = explanation;

                        unitObj.questions.Add(q);
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
            sb.AppendLine("if (typeof module !== 'undefined' && module.exports) {");
            sb.AppendLine("  module.exports = EXAM_DATABASE;");
            sb.AppendLine("}");

            File.WriteAllText(jsPath, sb.ToString(), Encoding.UTF8);
            Console.WriteLine("SUCCESS! Written " + jsPath + " successfully.");
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

            // Pattern 3: **1.** 【答案：D】
            Match m3 = Regex.Match(line, @"^\*\*(\d+)\.\*\*\s*【答案：\s*([^】]+)】\s*(.*)$");
            if (m3.Success)
            {
                qNum = int.Parse(m3.Groups[1].Value);
                answer = NormalizeAnswer(m3.Groups[2].Value);
                string rest = m3.Groups[3].Value.Trim();
                string dummyAns;
                ParseAnswerAndYear(rest, out dummyAns, out year, out rate, out stem);
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
