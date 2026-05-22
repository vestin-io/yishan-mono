package cmd

import (
	"github.com/spf13/cobra"
	"yishan/apps/cli/internal/api"
	"yishan/apps/cli/internal/output"
	cliruntime "yishan/apps/cli/internal/runtime"
)

var nodeCmd = &cobra.Command{
	Use:   "node",
	Short: "Node operations",
	Long:  `Create, list, and delete compute nodes registered to a Yishan organization.`,
}

var nodeListCmd = &cobra.Command{
	Use:   "list",
	Short: "List organization nodes",
	Long:  `List all nodes registered to the current organization.`,
	Example: `  yishan node list
  yishan node list --output json`,
	RunE: func(cmd *cobra.Command, _ []string) error {
		orgID, err := resolveOrgID(cmd)
		if err != nil {
			return err
		}

		response, err := cliruntime.APIClient().ListNodes(orgID)
		if err != nil {
			return err
		}

		return output.PrintAny(response)
	},
}

var nodeCreateCmd = &cobra.Command{
	Use:   "create",
	Short: "Create organization node",
	Long:  `Register a new compute node with the organization. Scope "private" means only the creating user can use the node; "shared" makes it available to all org members.`,
	Example: `  yishan node create --name my-server --scope shared
  yishan node create --name my-server --scope private --endpoint https://my.host:8080`,
	RunE: func(cmd *cobra.Command, _ []string) error {
		orgID, err := resolveOrgID(cmd)
		if err != nil {
			return err
		}
		name, err := cmd.Flags().GetString("name")
		if err != nil {
			return err
		}
		scope, err := cmd.Flags().GetString("scope")
		if err != nil {
			return err
		}
		endpoint, err := cmd.Flags().GetString("endpoint")
		if err != nil {
			return err
		}
		metadataOS, err := cmd.Flags().GetString("metadata-os")
		if err != nil {
			return err
		}
		metadataVersion, err := cmd.Flags().GetString("metadata-version")
		if err != nil {
			return err
		}

		input := api.CreateNodeInput{
			Name:     name,
			Scope:    scope,
			Endpoint: endpoint,
		}
		if metadataOS != "" || metadataVersion != "" {
			metadata := map[string]any{}
			if metadataOS != "" {
				metadata["os"] = metadataOS
			}
			if metadataVersion != "" {
				metadata["version"] = metadataVersion
			}
			input.Metadata = metadata
		}

		response, err := cliruntime.APIClient().CreateNode(orgID, input)
		if err != nil {
			return err
		}

		return output.PrintAny(response)
	},
}

var nodeDeleteCmd = &cobra.Command{
	Use:   "delete",
	Short: "Delete organization node",
	Long:  `Deregister a node from the organization. Any workspaces currently assigned to the node will lose their compute backend.`,
	Example: `  yishan node delete --node-id <node-id>`,
	RunE: func(cmd *cobra.Command, _ []string) error {
		orgID, err := resolveOrgID(cmd)
		if err != nil {
			return err
		}
		nodeID, err := cmd.Flags().GetString("node-id")
		if err != nil {
			return err
		}

		response, err := cliruntime.APIClient().DeleteNode(orgID, nodeID)
		if err != nil {
			return err
		}

		return output.PrintAny(response)
	},
}

func init() {
	rootCmd.AddCommand(nodeCmd)
	nodeCmd.AddCommand(nodeListCmd)
	nodeCmd.AddCommand(nodeCreateCmd)
	nodeCmd.AddCommand(nodeDeleteCmd)

	addOrgIDFlag(nodeListCmd)

	addOrgIDFlag(nodeCreateCmd)
	nodeCreateCmd.Flags().String("name", "", "node name")
	nodeCreateCmd.Flags().String("scope", "shared", "node scope (private|shared)")
	nodeCreateCmd.Flags().String("endpoint", "", "node endpoint URL")
	nodeCreateCmd.Flags().String("metadata-os", "", "node OS metadata")
	nodeCreateCmd.Flags().String("metadata-version", "", "node version metadata")
	cobra.CheckErr(nodeCreateCmd.MarkFlagRequired("name"))

	addOrgIDFlag(nodeDeleteCmd)
	nodeDeleteCmd.Flags().String("node-id", "", "node ID")
	cobra.CheckErr(nodeDeleteCmd.MarkFlagRequired("node-id"))
}
