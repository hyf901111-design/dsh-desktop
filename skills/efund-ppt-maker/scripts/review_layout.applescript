-- Export the review PDF to a fresh PowerPoint-owned temporary directory.
on run argv
    if (count argv) is not 1 then error "需要成品 PPTX 的绝对路径"
    set inputPath to POSIX path of ((POSIX file (item 1 of argv)) as alias)
    ignoring case
        if inputPath does not end with ".pptx" then error "请检查 PPTX 路径"
    end ignoring
    tell application "Microsoft PowerPoint" to set scratchRoot to POSIX path of (path to temporary items from user domain)
    set scratch to do shell script "/usr/bin/mktemp -d " & quoted form of (scratchRoot & "ework-ppt.XXXXXX")
    set pdfPath to scratch & "/review.pdf"
    do shell script "/usr/bin/open -a 'Microsoft PowerPoint' " & quoted form of inputPath
    with timeout of 120 seconds
        tell application "Microsoft PowerPoint"
            repeat 80 times
                if (count of document windows) > 0 then
                    if full name of active presentation is inputPath then exit repeat
                end if
                delay 0.25
            end repeat
            set deck to active presentation
            if full name of deck is not inputPath or not (saved of deck) then error "成品未打开或含未保存的编辑"
            set visited to {}
            set total to count of slides of deck
            repeat with i from 1 to total
                if full name of active presentation is not inputPath then error "PowerPoint 当前文件已切换"
                go to slide view of active window number i
                delay 0.35
                set observed to slide index of slide of view of active window
                if observed is not (i as integer) then error "未能访问第 " & i & " 页"
                set end of visited to observed
            end repeat
            save deck in (POSIX file pdfPath) as save as PDF
            if full name of active presentation is inputPath then go to slide view of active window number 1
            return {pdfPath, visited}
        end tell
    end timeout
end run
