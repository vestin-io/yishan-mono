package agentcmd

type geminiBuilder struct{}

func (b geminiBuilder) Binary() string { return "gemini" }

func (b geminiBuilder) Args(prompt, model string) []string {
	args := []string{"run", "--prompt", prompt}
	if model != "" {
		args = append(args, "--model", model)
	}
	return args
}
