// This helper contains no character artwork or engine code. It only connects
// the user's explicitly selected existing workspace to this portable package.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Text;
using System.Web.Script.Serialization;
using System.Windows.Forms;

internal static class OriginalCharacterConnector
{
    private static readonly string[] CharacterFiles = {
        "geometry-data.js", "src/math.js", "src/tables.js", "src/pose.js",
        "src/tricks.js", "src/fx.js", "src/eyes.js", "src/character.js"
    };

    [STAThread]
    private static int Main(string[] args)
    {
        // Test-only validation performs the same checks as the GUI, but never
        // writes a marker or starts a process. Output has no local path data.
        if (args.Length > 0)
        {
            if (args.Length != 3 || (args[0] != "--validate-only" && args[0] != "--bind-only")) return 64;
            try
            {
                Connection connection = Validate(args[1], args[2]);
                if (args[0] == "--bind-only") Save(connection);
                Console.WriteLine("{\"ok\":true,\"writes\":" + (args[0] == "--bind-only" ? "1" : "0") + ",\"launches\":0}");
                return 0;
            }
            catch (ConnectionException error)
            {
                Console.WriteLine("{\"ok\":false,\"code\":\"" + error.Code + "\",\"writes\":0,\"launches\":0}");
                return 2;
            }
            catch
            {
                Console.WriteLine("{\"ok\":false,\"code\":\"unavailable\",\"writes\":0,\"launches\":0}");
                return 2;
            }
        }

        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        Application.Run(new ConnectorWindow());
        return 0;
    }

    private sealed class ConnectionException : Exception
    {
        internal readonly string Code;
        internal ConnectionException(string code, string message) : base(message) { Code = code; }
    }

    private sealed class Connection
    {
        internal string Workspace;
        internal string CharacterRoot;
        internal string PackageRoot;
        internal string Marker;
        internal string Program;
    }

    private static Connection Validate(string workspace, string packageRoot)
    {
        string selected = OrdinaryDirectory(workspace);
        string destination = OrdinaryDirectory(packageRoot);
        RejectPackageLinks(destination);
        string assets = Inside(selected, Path.Combine(selected, "vendor", "grok-study", "replica"));
        OrdinaryDirectory(assets);
        foreach (string relative in CharacterFiles)
            OrdinaryFile(Inside(assets, Path.Combine(assets, relative.Replace('/', Path.DirectorySeparatorChar))));

        string appDirectory = Inside(destination, Path.Combine(destination, "resources", "app"));
        OrdinaryDirectory(appDirectory);
        string manifest = Path.Combine(appDirectory, "package.json");
        OrdinaryFile(manifest);
        if (new FileInfo(manifest).Length > 65536)
            throw new ConnectionException("package-invalid", "程序文件不完整，请重新解压整个伴屏文件夹。");
        Dictionary<string, object> metadata;
        try
        {
            metadata = new JavaScriptSerializer().Deserialize<Dictionary<string, object>>(File.ReadAllText(manifest, Encoding.UTF8));
        }
        catch
        {
            throw new ConnectionException("package-invalid", "程序文件不完整，请重新解压整个伴屏文件夹。");
        }
        object name;
        object main;
        if (metadata == null || !metadata.TryGetValue("name", out name) || !Object.Equals(name, "banping-demo")
            || !metadata.TryGetValue("main", out main) || !Object.Equals(main, "apps/desktop/dist-electron/main.js"))
            throw new ConnectionException("package-invalid", "请将连接助手放在伴屏程序旁，再重新打开。");
        string program = Path.Combine(destination, "伴屏.exe");
        OrdinaryFile(program);
        string marker = Path.Combine(appDirectory, "local-desktop.json");
        ValidateOptionalMarker(marker);
        return new Connection { Workspace = selected, CharacterRoot = assets, PackageRoot = destination, Marker = marker, Program = program };
    }

    private static string Normalize(string input)
    {
        // Device paths, UNC shares, alternate data streams and ambiguous Win32
        // trailing-dot/space paths are outside this same-computer connector.
        if (String.IsNullOrWhiteSpace(input) || input.Length < 3 || !Char.IsLetter(input[0]) || input[1] != ':'
            || (input[2] != '\\' && input[2] != '/') || input.IndexOf(':', 2) >= 0)
            throw new ConnectionException("path-invalid", "请选择这台电脑上的普通文件夹。");
        string full = Path.GetFullPath(input).TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        if (full.Length == 2) full += Path.DirectorySeparatorChar;
        foreach (string part in full.Substring(3).Split(Path.DirectorySeparatorChar))
        {
            if (part.EndsWith(".", StringComparison.Ordinal) || part.EndsWith(" ", StringComparison.Ordinal))
                throw new ConnectionException("path-invalid", "请选择这台电脑上的普通文件夹。");
        }
        return full;
    }

    private static string OrdinaryDirectory(string path)
    {
        string full = Normalize(path);
        DirectoryInfo directory = new DirectoryInfo(full);
        while (directory != null)
        {
            FileAttributes attributes;
            try { attributes = File.GetAttributes(directory.FullName); }
            catch { throw new ConnectionException("directory-missing", "找不到所需文件夹，请选择原角色所在的伴屏工作区。"); }
            if ((attributes & FileAttributes.ReparsePoint) != 0)
                throw new ConnectionException("linked-path", "请选择原始文件夹；连接助手不接受目录链接或快捷路径。");
            if ((attributes & FileAttributes.Directory) == 0)
                throw new ConnectionException("directory-invalid", "请选择原角色所在的伴屏工作区文件夹。");
            directory = directory.Parent;
        }
        return full;
    }

    private static void OrdinaryFile(string path)
    {
        string full = Normalize(path);
        OrdinaryDirectory(Path.GetDirectoryName(full));
        FileAttributes attributes;
        try { attributes = File.GetAttributes(full); }
        catch { throw new ConnectionException("file-missing", "所选文件夹缺少必要文件，请选择完整的伴屏工作区。"); }
        if ((attributes & FileAttributes.ReparsePoint) != 0)
            throw new ConnectionException("linked-path", "请选择原始文件；连接助手不接受文件链接。");
        if ((attributes & FileAttributes.Directory) != 0)
            throw new ConnectionException("file-invalid", "所选文件夹内容不完整，请重新选择。");
    }

    private static string Inside(string root, string candidate)
    {
        string full = Normalize(candidate);
        if (!full.StartsWith(root.TrimEnd('\\') + "\\", StringComparison.OrdinalIgnoreCase))
            throw new ConnectionException("outside-workspace", "所选内容超出工作区，请重新选择。");
        return full;
    }

    private static bool ValidateOptionalMarker(string marker)
    {
        try { File.GetAttributes(marker); }
        catch (FileNotFoundException) { return false; }
        catch (DirectoryNotFoundException) { return false; }
        // GetAttributes also detects a dangling reparse point, which Exists
        // alone could incorrectly report as an absent destination.
        OrdinaryFile(marker);
        return true;
    }

    private static void RejectPackageLinks(string directory)
    {
        foreach (string entry in Directory.GetFileSystemEntries(directory))
        {
            FileAttributes attributes = File.GetAttributes(entry);
            if ((attributes & FileAttributes.ReparsePoint) != 0)
                throw new ConnectionException("linked-path", "程序目录包含链接，请重新解压整个伴屏文件夹。");
            if ((attributes & FileAttributes.Directory) != 0) RejectPackageLinks(entry);
        }
    }

    private static void Save(Connection connection)
    {
        // Revalidate immediately before mutation. The helper does not read any
        // user profile and creates no backup containing machine-specific data.
        Connection current = Validate(connection.Workspace, connection.PackageRoot);
        Dictionary<string, object> marker = new Dictionary<string, object>();
        marker.Add("kind", "banping-local-desktop");
        marker.Add("version", 1);
        marker.Add("workspaceRoot", current.Workspace);
        marker.Add("characterAssetRoot", current.CharacterRoot);
        byte[] data = new UTF8Encoding(false).GetBytes(new JavaScriptSerializer().Serialize(marker) + "\n");
        string temporary = Path.Combine(Path.GetDirectoryName(current.Marker), ".connect-" + Guid.NewGuid().ToString("N") + ".tmp");
        try
        {
            using (FileStream stream = new FileStream(temporary, FileMode.CreateNew, FileAccess.Write, FileShare.None))
            {
                stream.Write(data, 0, data.Length);
                stream.Flush(true);
            }
            // Atomic replacement stays on the same volume. Never overwrite or
            // follow a marker that was changed into a link after selection.
            OrdinaryDirectory(Path.GetDirectoryName(current.Marker));
            if (ValidateOptionalMarker(current.Marker))
            {
                OrdinaryFile(current.Marker);
                File.Replace(temporary, current.Marker, null);
            }
            else File.Move(temporary, current.Marker);
        }
        finally
        {
            if (File.Exists(temporary)) File.Delete(temporary);
        }
    }

    private sealed class ConnectorWindow : Form
    {
        private readonly Button connect;
        private readonly Label status;

        internal ConnectorWindow()
        {
            Text = "伴屏 · 连接原角色";
            ClientSize = new Size(470, 275);
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false;
            MinimizeBox = false;
            StartPosition = FormStartPosition.CenterScreen;
            BackColor = Color.FromArgb(250, 249, 246);
            Font = new Font("Microsoft YaHei UI", 10F);
            AutoScaleMode = AutoScaleMode.Font;
            Label title = new Label { Text = "连接你已有的黑色角色", Location = new Point(28, 24), Size = new Size(414, 32), Font = new Font("Microsoft YaHei UI", 16F, FontStyle.Bold) };
            Label explanation = new Label { Text = "选择原角色所在的伴屏工作区。\n角色留在原文件夹，连接后即可启动伴屏。", Location = new Point(30, 76), Size = new Size(408, 55) };
            status = new Label { Text = "已打开的伴屏请先退出，再连接或重新选择。", Location = new Point(30, 139), Size = new Size(408, 52), ForeColor = Color.FromArgb(95, 95, 95) };
            connect = new Button { Text = "选择工作区并启动", Location = new Point(244, 211), Size = new Size(196, 36), BackColor = Color.FromArgb(36, 36, 36), ForeColor = Color.White, FlatStyle = FlatStyle.Flat };
            connect.FlatAppearance.BorderSize = 0;
            Button cancel = new Button { Text = "取消", Location = new Point(139, 211), Size = new Size(90, 36), DialogResult = DialogResult.Cancel, FlatStyle = FlatStyle.Flat };
            cancel.FlatAppearance.BorderColor = Color.FromArgb(210, 210, 205);
            CancelButton = cancel;
            AcceptButton = connect;
            cancel.Click += delegate { Close(); };
            connect.Click += SelectWorkspace;
            Controls.AddRange(new Control[] { title, explanation, status, connect, cancel });
        }

        private void SelectWorkspace(object sender, EventArgs args)
        {
            using (FolderBrowserDialog dialog = new FolderBrowserDialog())
            {
                dialog.Description = "选择已有伴屏工作区（其中包含原角色文件夹）";
                dialog.ShowNewFolderButton = false;
                if (dialog.ShowDialog(this) != DialogResult.OK) return;
                connect.Enabled = false;
                try
                {
                    Connection connection = OriginalCharacterConnector.Validate(dialog.SelectedPath, AppDomain.CurrentDomain.BaseDirectory);
                    Save(connection);
                    OrdinaryFile(connection.Program);
                    Process.Start(new ProcessStartInfo(connection.Program) { WorkingDirectory = connection.PackageRoot, UseShellExecute = false });
                    Close();
                }
                catch (ConnectionException error) { status.Text = error.Message; }
                catch (UnauthorizedAccessException) { status.Text = "无法保存连接，请将整个程序解压到可写文件夹后重试。"; }
                catch { status.Text = "连接或启动未完成，请检查程序是否完整、可写，然后重试。"; }
                finally { if (!IsDisposed) connect.Enabled = true; }
            }
        }
    }
}
