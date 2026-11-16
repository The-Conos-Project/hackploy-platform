package sysinfo

import (
	"bufio"
	"fmt"
	"os"
	"runtime"
	"strconv"
	"strings"
	"syscall"
	"time"
)

type Snapshot struct {
	CPUPercent   float64 `json:"cpu_percent"`
	MemUsedBytes uint64  `json:"mem_used_bytes"`
	MemTotalBytes uint64 `json:"mem_total_bytes"`
	MemPercent   float64 `json:"mem_percent"`
	DiskUsedBytes uint64 `json:"disk_used_bytes"`
	DiskTotalBytes uint64 `json:"disk_total_bytes"`
	DiskPercent  float64 `json:"disk_percent"`
	Load1        float64 `json:"load_1"`
	GOOS         string  `json:"goos"`
	NumCPU       int     `json:"num_cpu"`
}

func Collect(dataDir string) Snapshot {
	snap := Snapshot{
		GOOS:   runtime.GOOS,
		NumCPU: runtime.NumCPU(),
	}
	snap.CPUPercent = cpuPercent()
	used, total := memBytes()
	snap.MemUsedBytes = used
	snap.MemTotalBytes = total
	if total > 0 {
		snap.MemPercent = float64(used) / float64(total) * 100
	}
	dUsed, dTotal := diskBytes(dataDir)
	snap.DiskUsedBytes = dUsed
	snap.DiskTotalBytes = dTotal
	if dTotal > 0 {
		snap.DiskPercent = float64(dUsed) / float64(dTotal) * 100
	}
	snap.Load1 = load1()
	return snap
}

func cpuPercent() float64 {
	a, ok := readCPU()
	if !ok {
		return 0
	}
	time.Sleep(120 * time.Millisecond)
	b, ok := readCPU()
	if !ok {
		return 0
	}
	idle := b.idle - a.idle
	total := b.total - a.total
	if total == 0 {
		return 0
	}
	busy := float64(total-idle) / float64(total) * 100
	if busy < 0 {
		return 0
	}
	if busy > 100 {
		return 100
	}
	return busy
}

type cpuSample struct {
	idle  uint64
	total uint64
}

func readCPU() (cpuSample, bool) {
	f, err := os.Open("/proc/stat")
	if err != nil {
		return cpuSample{}, false
	}
	defer f.Close()
	sc := bufio.NewScanner(f)
	if !sc.Scan() {
		return cpuSample{}, false
	}
	fields := strings.Fields(sc.Text())
	if len(fields) < 5 || fields[0] != "cpu" {
		return cpuSample{}, false
	}
	var vals []uint64
	for _, f := range fields[1:] {
		n, err := strconv.ParseUint(f, 10, 64)
		if err != nil {
			return cpuSample{}, false
		}
		vals = append(vals, n)
	}
	var total uint64
	for _, v := range vals {
		total += v
	}
	idle := vals[3]
	if len(vals) > 4 {
		idle += vals[4] // iowait
	}
	return cpuSample{idle: idle, total: total}, true
}

func memBytes() (used, total uint64) {
	f, err := os.Open("/proc/meminfo")
	if err != nil {
		return 0, 0
	}
	defer f.Close()
	var memTotal, memAvail uint64
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		line := sc.Text()
		if strings.HasPrefix(line, "MemTotal:") {
			memTotal = parseMemKB(line) * 1024
		} else if strings.HasPrefix(line, "MemAvailable:") {
			memAvail = parseMemKB(line) * 1024
		}
	}
	if memTotal == 0 {
		return 0, 0
	}
	return memTotal - memAvail, memTotal
}

func parseMemKB(line string) uint64 {
	fields := strings.Fields(line)
	if len(fields) < 2 {
		return 0
	}
	n, _ := strconv.ParseUint(fields[1], 10, 64)
	return n
}

func diskBytes(path string) (used, total uint64) {
	if path == "" {
		path = "/"
	}
	var st syscall.Statfs_t
	if err := syscall.Statfs(path, &st); err != nil {
		return 0, 0
	}
	total = st.Blocks * uint64(st.Bsize)
	free := st.Bavail * uint64(st.Bsize)
	if total < free {
		return 0, total
	}
	return total - free, total
}

func load1() float64 {
	b, err := os.ReadFile("/proc/loadavg")
	if err != nil {
		return 0
	}
	fields := strings.Fields(string(b))
	if len(fields) == 0 {
		return 0
	}
	var v float64
	_, _ = fmt.Sscanf(fields[0], "%f", &v)
	return v
}
